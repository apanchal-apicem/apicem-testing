"""Pure logic, no DB -- date-range/metric/compare matching in assistant_intents.py never
touches Postgres, so these are plain unit tests (unlike the rest of tests/, which
deliberately runs against the real DB per conftest.py's docstring).
"""
from datetime import date, timedelta

from app.assistant_intents import (
    is_greeting,
    match_date_window,
    match_metric,
    resolve_date_range,
    wants_compare,
)


# Third pass, same day: a real user hit ANOTHER follow-up gap immediately after the previous
# fix shipped -- "what is the revenue today" -> "and yesterday?" both worked, but "and day
# before ?" still hit the rejection. "day before yesterday" is the absolute (today-relative)
# phrase; bare "day before" as a context-relative follow-up is covered at the API level in
# test_assistant_api.py since it needs a previous answer to anchor against, not just today.
def test_match_date_window_day_before_yesterday():
    today = date(2026, 8, 31)
    start, end, label = match_date_window("what was my revenue the day before yesterday", today)
    assert (start, end) == (date(2026, 8, 29), date(2026, 8, 29))
    assert label == "the day before yesterday"


def test_match_date_window_day_before_yesterday_does_not_resolve_as_plain_yesterday():
    # The exact ordering bug this could have been: "day before yesterday" contains
    # "yesterday" as a substring, so checking bare "yesterday" first would have silently
    # resolved this one day wrong (today - 1 instead of today - 2).
    today = date(2026, 8, 31)
    start, end, _ = match_date_window("day before yesterday", today)
    assert start != today - timedelta(days=1)


# Follow-up pass, same day: a second reviewer's read-through of the first pass. #1 (per-metric
# phrase gaps) and #3 (COMPARE_PHRASES gaps) are purely additive so covered lightly here (one
# representative case each, not every phrase -- the risk they guard against is a bad
# cross-metric substring collision, not "did I type every synonym"). #2 (vague headline
# questions) reuses net_revenue's existing bare-phrase convention rather than new code. #4
# (greeting path) is the one genuinely new code path in this pass.
def test_match_metric_vague_headline_question_defaults_to_net_revenue():
    assert match_metric("how am i doing") == "net_revenue"
    assert match_metric("how's business") == "net_revenue"
    assert match_metric("give me an overview") == "net_revenue"


def test_match_metric_new_per_metric_phrases_dont_collide_with_other_metrics():
    # "how many sales" is longer than net_revenue's bare "sales", so longest-match-wins must
    # still resolve it to order_count, not net_revenue -- the one collision this pass
    # introduces on purpose (same pattern as the "trend" fix from earlier today).
    assert match_metric("how many sales did i have") == "order_count"
    assert match_metric("what needs restocking") == "inventory_by_product"
    assert match_metric("cost to acquire a customer") == "blended_cpa"
    assert match_metric("what's my inventory worth") == "total_inventory_value"


def test_wants_compare_detects_new_movement_words():
    assert wants_compare("is revenue growing or declining") is True
    assert wants_compare("did ad spend drop") is False  # "dropped" is listed, not "drop"
    assert wants_compare("orders dropped this month") is True


def test_is_greeting_matches_common_greetings():
    assert is_greeting("hi") is True
    assert is_greeting("Hello!") is True
    assert is_greeting("thanks!") is True
    assert is_greeting("what can you help with") is True


def test_is_greeting_word_boundary_does_not_false_match_inside_other_words():
    # The exact false-positive a naive substring match would hit -- "which"/"this"/"shipping"
    # all contain "hi" as a bare substring.
    assert is_greeting("which products sell best") is False
    assert is_greeting("what's my shipping cost") is False
    assert is_greeting("revenue this month") is False


def test_greeting_never_preempts_a_real_metric_match():
    # is_greeting() is checked only as an alternative to the final rejection in
    # ask_assistant(), never before match_metric() -- so a real business question that
    # happens to also contain a greeting word must still match its metric via match_metric()
    # directly (this test pins that match_metric() itself is unaffected by greeting words,
    # which is what makes that ordering safe).
    assert match_metric("hi, what's my revenue today") == "net_revenue"


# Regression tests for the 2026-09-07 pass: grounded in the real "Apicem Partners" tenant's
# actual chat history (10 real messages, read via app.assistant_messages) rather than guessed
# synonyms -- "show me trend" was a real miss (hit the "I don't recognize that" fallback since
# every existing trend phrase requires a qualifier word first). today/yesterday, "last week",
# and "this quarter" were added alongside it as unambiguous, zero-risk gaps in the same pass.
def test_match_date_window_today():
    today = date(2026, 8, 31)
    start, end, label = match_date_window("how much did i make today", today)
    assert (start, end) == (date(2026, 8, 31), date(2026, 8, 31))
    assert label == "today"


def test_match_date_window_yesterday():
    today = date(2026, 8, 31)
    start, end, label = match_date_window("what was my revenue yesterday", today)
    assert (start, end) == (date(2026, 8, 30), date(2026, 8, 30))
    assert label == "yesterday"


def test_match_date_window_last_week_maps_to_7_days():
    today = date(2026, 8, 31)
    start, end, label = match_date_window("how did i do last week", today)
    assert (start, end) == (date(2026, 8, 24), date(2026, 8, 31))


def test_match_date_window_this_quarter_maps_to_90_days():
    today = date(2026, 8, 31)
    start, end, label = match_date_window("revenue this quarter", today)
    assert (start, end) == (date(2026, 6, 2), date(2026, 8, 31))


def test_match_metric_bare_trend_defaults_to_revenue_trend():
    # The exact real-user question that hit the fallback message before this fix.
    assert match_metric("show me trend") == "revenue_trend"


def test_match_metric_bare_trend_loses_to_a_more_specific_trend_phrase():
    assert match_metric("show me the ad spend trend") == "ad_spend_trend"
    assert match_metric("discounts trend please") == "discounts_refunds_trend"


# Regression test for the 2026-08-31 bug: the dashboard's "Last N days" presets and
# backend defaults (DateRangeSelector.tsx, routers/dashboards.py, routers/metrics.py) have
# always used an (N+1)-day inclusive window (today - N to today). assistant_intents.py was
# rewritten independently and used an N-day window (today - (N-1) to today) instead, so the
# assistant silently reported a different number than the dashboard for the same labeled
# range -- e.g. ad spend "last 7 days" was $12,468.73 in chat vs $14,992.24 on the
# dashboard, a whole extra day's spend. These pin the assistant to the app-wide convention
# so it can't drift again.
def test_resolve_date_range_last_7_days_matches_dashboard_convention():
    today = date(2026, 8, 31)
    start, end = resolve_date_range("last_7_days", today)
    assert (start, end) == (date(2026, 8, 24), date(2026, 8, 31))


def test_resolve_date_range_last_30_days_matches_dashboard_convention():
    today = date(2026, 8, 31)
    start, end = resolve_date_range("last_30_days", today)
    assert (start, end) == (date(2026, 8, 1), date(2026, 8, 31))


def test_resolve_date_range_last_90_days_matches_dashboard_convention():
    today = date(2026, 8, 31)
    start, end = resolve_date_range("last_90_days", today)
    assert (start, end) == (date(2026, 6, 2), date(2026, 8, 31))


def test_match_date_window_generic_last_n_days_matches_dashboard_convention():
    today = date(2026, 8, 31)
    start, end, label = match_date_window("what's my revenue for the last 60 days", today)
    assert (start, end) == (date(2026, 7, 2), date(2026, 8, 31))
    assert label == "the last 60 days"


def test_resolve_date_range_same_period_last_year_shifts_the_30_day_window():
    today = date(2026, 8, 31)
    start, end = resolve_date_range("same_period_last_year", today)
    assert (start, end) == (date(2025, 8, 1), date(2025, 8, 31))


# match_date_window's other branches -- named months and idiomatic phrases -- were already
# the subject of an earlier fix this session (the "gross revenue for july '26" incident);
# covering them here too so future edits to this file can't silently reintroduce either bug.
def test_match_date_window_named_month_with_year():
    today = date(2026, 8, 31)
    start, end, label = match_date_window("gross revenue for july '26", today)
    assert (start, end) == (date(2026, 7, 1), date(2026, 7, 31))
    assert label == "July 2026"


def test_match_date_window_bare_month_name_before_it_has_happened_means_last_year():
    today = date(2026, 3, 1)
    start, end, label = match_date_window("revenue for december", today)
    assert start.year == 2025
    assert label == "December 2025"


def test_match_date_window_no_recognized_phrase_falls_back_to_default():
    today = date(2026, 8, 31)
    start, end, label = match_date_window("how's business going", today)
    assert (start, end) == (date(2026, 8, 1), date(2026, 8, 31))
    assert label == "the last 30 days"


def test_match_metric_longest_phrase_wins():
    # "gross margin" is a substring of nothing else, but "revenue" alone must not shadow
    # "net revenue" -- longest-match-wins is the whole point of match_metric.
    assert match_metric("what's my net revenue this month") == "net_revenue"
    assert match_metric("what's my gross revenue this month") == "gross_revenue"


def test_match_metric_no_match_returns_none():
    assert match_metric("how's the weather") is None


def test_wants_compare_detects_comparison_language():
    assert wants_compare("how does this compare to last month") is True
    assert wants_compare("what's my revenue this month") is False
