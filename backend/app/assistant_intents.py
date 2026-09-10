"""Deterministic, rule-based question answering for Ask Apicem Engine.

This is the "your own model" the definitions live in -- no LLM, no network call, no
sampling randomness. A question is matched against METRIC_PHRASES below (longest matching
phrase wins) to pick a metric, then match_date_window() to pick an actual date range (either
a specific named month like "July 2026", or one of DATE_RANGE_PHRASES' relative windows), and
a couple of keywords to decide whether a comparison to the previous period was asked for.
Everything downstream of that match -- compute_metric() -- is the exact same server-side code
every dashboard already uses, so the numbers and the KpiTile/TrendChart/MetricTable rendered
from them are identical to a dashboard's.

This can never contradict itself the way an earlier Ollama-based version occasionally did
(removed -- see git history if an LLM fallback for unrecognized questions is wanted later):
the same question always maps to the same metric, the same date range, and the direction word
is always read straight off the sign of the real delta_pct, never phrased freely. The
trade-off is coverage, not correctness -- a question phrased in a way nothing below
anticipates gets an honest "I don't recognize that" instead of a guess. The fix for that is
always the same: add the phrase below, not "make the model smarter."

To teach it a new way of asking about an existing metric: add the phrase to that metric's
list in METRIC_PHRASES. To teach it a new relative date range synonym: add it to
DATE_RANGE_PHRASES -- specific months ("July", "July 2026") and "last/past N days/months" are
already handled generically by match_date_window(), nothing to add there. Matching is plain
substring containment on the lowercased question, so phrases should be the literal words a
person would actually type.
"""
import calendar
import re
from datetime import date, timedelta

from .config import settings
from .groq_fallback import classify_via_groq
from .metric_registry import SCALAR_METRICS, SERIES_METRICS, TABLE_METRICS, compute_metric
from .rate_limit import allow as rate_limit_allow

# Bounds worst-case Groq API spend independent of the is_demo gate below -- keyed per tenant
# (not per IP, unlike rate_limit()'s route-level dependency) since this check only fires deep
# inside ask_assistant(), after every deterministic match attempt has already failed.
GROQ_FALLBACK_MAX_CALLS_PER_HOUR = 20

ALL_METRIC_KEYS = list(SCALAR_METRICS) + list(SERIES_METRICS) + list(TABLE_METRICS)

# Purely a display grouping for the "what can I ask about" list on the Assistant page --
# mirrors Shell.tsx's Sales/Marketing/Inventory nav sections so the categories a user already
# recognizes from the dashboards line up with what the assistant can answer. The assertion
# below guarantees this can't silently drift from the registry: forgetting to categorize a
# newly added metric fails app startup instead of quietly omitting it from the list.
CATEGORY_METRIC_KEYS = [
    ("Sales", [
        "gross_revenue", "net_revenue", "order_count", "total_discounts", "total_refunds",
        "new_customer_count", "aov", "gross_margin_pct", "revenue_trend",
        "discounts_refunds_trend", "top_products",
    ]),
    ("Marketing", [
        "total_ad_spend", "total_conversions", "blended_roas", "blended_cpa", "blended_ctr",
        "ad_spend_trend", "campaign_performance",
    ]),
    ("Inventory", [
        "total_inventory_value", "total_units_on_hand", "low_stock_count", "inventory_by_product",
    ]),
]

_categorized_keys = [key for _, keys in CATEGORY_METRIC_KEYS for key in keys]
assert sorted(_categorized_keys) == sorted(ALL_METRIC_KEYS), (
    "CATEGORY_METRIC_KEYS in assistant_intents.py is out of sync with metric_registry.py -- "
    "every metric key must appear in exactly one category."
)

# Every recognized way of referring to each metric. The capability pills on the Assistant
# page ("Show me <label>") are guaranteed to match, since each metric's own label (lowercased)
# is always included below -- add more natural phrasings around it as real questions reveal
# gaps. Ordering within a list doesn't matter; matching picks the single longest phrase that
# appears anywhere in the question, across every metric, so a more specific phrase (e.g.
# "gross revenue") correctly wins over a shorter, more generic one (e.g. "revenue") when both
# are present.
METRIC_PHRASES: dict[str, list[str]] = {
    # Sales
    "gross_revenue": ["gross revenue", "gross sales", "revenue before discounts"],
    "net_revenue": [
        "net revenue", "revenue", "sales", "earnings",
        "how much did i make", "how much money did i make", "how much have i made",
        # A vague "headline" question names no metric at all -- same convention as a bare
        # "revenue"/"sales" mention already gets (the docstring on ask_assistant calls this
        # out for wants_compare-with-no-metric too): default to the one number a business
        # owner means by "how am I doing," rather than the generic rejection.
        "how am i doing", "how's business", "hows business", "give me an overview", "overview",
    ],
    "order_count": [
        "orders", "order count", "number of orders", "how many orders",
        "how many sales", "number of sales",
    ],
    "total_discounts": ["total discounts", "discounts", "how much discount"],
    "total_refunds": [
        "total refunds", "refunds", "how much refunded", "how much did i refund",
        "returns", "how many refunds",
    ],
    "new_customer_count": [
        "new customers", "new customer count", "how many new customers", "first time customers",
    ],
    "aov": [
        "average order value", "aov", "average order size", "average sale amount",
        "average basket size", "average cart value",
    ],
    "gross_margin_pct": [
        "gross margin", "margin percent", "profit margin", "how profitable am i", "profitability",
    ],
    "revenue_trend": [
        "revenue trend", "sales trend", "revenue over time", "sales over time", "daily revenue",
        # Bare "trend"/"graph"/"chart" name no specific metric -- same "headline" convention
        # as net_revenue's bare "revenue"/"sales" below, just for the headline chart instead
        # of the headline number. Confirmed by a real miss: a real user's "show me trend" hit
        # the "I don't recognize that" fallback since every other trend phrase here requires
        # a qualifier word first. Longest-match-wins in match_metric() means any of the more
        # specific "<x> trend" phrases above (or elsewhere, e.g. "ad spend trend") still win
        # over this one when they're also present in the question.
        "trend", "graph my revenue", "graph revenue", "plot revenue", "plot sales",
    ],
    "discounts_refunds_trend": [
        "discounts and refunds trend", "discounts refunds trend", "discounts trend", "refunds trend",
    ],
    "top_products": [
        "top products by revenue", "top products", "best selling products", "best sellers",
        "top selling", "which products sell best", "what's selling well", "whats selling well",
        "what are people buying",
    ],

    # Marketing
    "total_ad_spend": [
        "total ad spend", "ad spend", "advertising spend",
        "how much did i spend on ads", "marketing spend", "ad budget",
    ],
    "total_conversions": ["total conversions", "conversions", "how many conversions"],
    "blended_roas": ["blended roas", "roas", "return on ad spend", "ad performance", "roi on ads"],
    "blended_cpa": [
        "blended cpa", "cost per acquisition", "cost per conversion", "cpa",
        "acquisition cost", "cost to acquire a customer",
    ],
    "blended_ctr": ["blended ctr", "click through rate", "click-through rate", "ctr", "click rate"],
    "ad_spend_trend": ["ad spend trend", "advertising spend trend", "ad spend over time"],
    "campaign_performance": [
        "campaign performance", "which campaigns", "how are my campaigns", "campaign results",
        "best campaign", "worst campaign",
    ],

    # Inventory
    "total_inventory_value": [
        "inventory value", "value of my inventory", "how much inventory", "stock value",
        "what's my inventory worth", "whats my inventory worth",
    ],
    "total_units_on_hand": ["units on hand", "total units", "how many units", "total stock"],
    "low_stock_count": [
        "low stock products count", "low stock count", "how many products are low on stock",
        "how many low stock", "number of low stock products",
    ],
    "inventory_by_product": [
        "inventory by product", "which products are low on stock", "low stock products",
        "products low on stock", "what's low on stock", "whats low on stock", "low inventory",
        "what needs restocking", "what should i reorder",
    ],
}

_categorized = set(METRIC_PHRASES)
_registry_keys = set(SCALAR_METRICS) | set(SERIES_METRICS) | set(TABLE_METRICS)
assert _categorized == _registry_keys, (
    "METRIC_PHRASES in assistant_intents.py is out of sync with metric_registry.py -- every "
    "metric key needs at least one recognized phrase, or it can never be reached."
)

# Idiomatic phrasings only -- anything literally saying "last/past N days" or "N months" is
# handled generically by _match_relative_days()/_match_relative_months() below for any N
# (7, 30, 60, 90, whatever), so those don't need an entry here too.
DATE_RANGE_PHRASES: list[tuple[str, list[str]]] = [
    ("same_period_last_year", [
        "same time last year", "this time last year", "year over year", "yoy", "vs last year",
    ]),
    ("last_year", ["last year"]),
    ("this_year", ["this year", "year to date", "ytd"]),
    ("last_month", ["last month", "previous month"]),
    ("this_month", ["this month"]),
    ("last_90_days", ["last quarter", "past quarter", "this quarter"]),
    ("last_7_days", ["this week", "past week", "last week"]),
    ("last_30_days", ["past month"]),
]

DATE_RANGE_LABELS: dict[str, str] = {
    "last_7_days": "the last 7 days",
    "last_30_days": "the last 30 days",
    "last_90_days": "the last 90 days",
    "this_month": "this month",
    "last_month": "last month",
    "this_year": "this year",
    "last_year": "last year",
    "same_period_last_year": "the same period last year",
}

COMPARE_PHRASES = [
    "compar", "vs", "versus", "change", "increase", "decrease", "up or down", "higher or lower",
    "previous period", "prior period", "period before", "before that",
    "growth", "growing", "declining", "dropped", "went up", "went down",
    "better or worse", "how does it compare",
    # Deliberately NOT adding bare "trend" here -- it'd read as compare-language on every
    # trend question, which would collide with the bare "trend" phrase just added to
    # revenue_trend in METRIC_PHRASES above. (In practice ask_assistant() already ANDs
    # compare with `metric_key in SCALAR_METRICS`, so it wouldn't actually affect
    # revenue_trend's own reply -- but it'd needlessly compute a delta for other scalar
    # metrics whenever "trend" appears incidentally in an otherwise-unrelated question.)
]

DEFAULT_DATE_RANGE = "last_30_days"

MONTH_NAMES: dict[str, int] = {
    "january": 1, "jan": 1, "february": 2, "feb": 2, "march": 3, "mar": 3,
    "april": 4, "apr": 4, "may": 5, "june": 6, "jun": 6, "july": 7, "jul": 7,
    "august": 8, "aug": 8, "september": 9, "sep": 9, "sept": 9, "october": 10, "oct": 10,
    "november": 11, "nov": 11, "december": 12, "dec": 12,
}


def _metric_label(key: str) -> str:
    for registry in (SCALAR_METRICS, SERIES_METRICS, TABLE_METRICS):
        if key in registry:
            return registry[key]["label"]
    return key


def _metric_kind(key: str) -> str:
    if key in SCALAR_METRICS:
        return "number"
    if key in SERIES_METRICS:
        return "trend"
    return "table"


def build_capabilities() -> list[dict]:
    """The "what you can ask about" list on the Assistant page -- reshaped from
    CATEGORY_METRIC_KEYS so it can never go out of sync with what the assistant can actually
    answer (both are checked against the same registry at import time)."""
    return [
        {
            "category": category,
            "metrics": [
                {"key": key, "label": _metric_label(key), "kind": _metric_kind(key)}
                for key in keys
            ],
        }
        for category, keys in CATEGORY_METRIC_KEYS
    ]


def match_metric(question: str) -> str | None:
    q = question.lower()
    best_key, best_len = None, 0
    for metric_key, phrases in METRIC_PHRASES.items():
        for phrase in phrases:
            if phrase in q and len(phrase) > best_len:
                best_key, best_len = metric_key, len(phrase)
    return best_key


def _shift_years(d: date, years: int) -> date:
    try:
        return d.replace(year=d.year + years)
    except ValueError:
        # Feb 29 doesn't exist in the target year -- fall back a day, same convention
        # used for a leap-day birthday.
        return d.replace(year=d.year + years, day=28)


def resolve_date_range(key: str, today: date) -> tuple[date, date]:
    """Date arithmetic for the fixed, idiomatic DATE_RANGE_PHRASES keys -- deterministic and
    server-side, same principle as the rest of this file: never left to interpretation."""
    if key == "last_7_days":
        return today - timedelta(days=7), today
    if key == "last_30_days":
        return today - timedelta(days=30), today
    if key == "last_90_days":
        return today - timedelta(days=90), today
    if key == "this_month":
        return today.replace(day=1), today
    if key == "last_month":
        first_of_this_month = today.replace(day=1)
        last_of_last_month = first_of_this_month - timedelta(days=1)
        return last_of_last_month.replace(day=1), last_of_last_month
    if key == "this_year":
        return today.replace(month=1, day=1), today
    if key == "last_year":
        return date(today.year - 1, 1, 1), date(today.year - 1, 12, 31)
    if key == "same_period_last_year":
        # Mirrors the app's own default recency window (the dashboards' "Last 30 days"
        # default), shifted back exactly one year.
        return _shift_years(today - timedelta(days=30), -1), _shift_years(today, -1)
    raise ValueError(f"unknown date_range: {key}")


def _match_named_month(question: str, today: date) -> tuple[date, date, str] | None:
    """"july", "july 2026", "july '26", "jul 26" -- a real calendar month, which
    DATE_RANGE_PHRASES has no way to express at all (it only covers relative windows like
    "last month"). Without this, a question naming a specific month silently fell through to
    DEFAULT_DATE_RANGE -- a completely different window with no indication anything was
    wrong, which is exactly how an answer for "July" turned out to actually be the last 30
    days. "may" alone is excluded (too easily the common word, not the month) unless it's
    followed by a year -- every other month name is unambiguous enough to match bare."""
    q = question.lower()
    for name, month_num in MONTH_NAMES.items():
        if name == "may":
            pattern = r"\bmay\s+'?(\d{2,4})\b"
        else:
            pattern = r"\b" + re.escape(name) + r"\b(?:\s+'?(\d{2,4}))?"
        match = re.search(pattern, q)
        if not match:
            continue
        year_text = match.group(1)
        if year_text:
            year = int(year_text)
            if year < 100:
                year += 2000
        else:
            year = today.year
            if date(year, month_num, 1) > today:
                year -= 1  # bare "December" in January means last December, not a future one
        start = date(year, month_num, 1)
        end = date(year, month_num, calendar.monthrange(year, month_num)[1])
        if end > today:
            end = today  # the current, still-in-progress month
        return start, end, f"{calendar.month_name[month_num]} {year}"
    return None


def _shift_months(d: date, months: int) -> date:
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _match_relative_days(question: str, today: date) -> tuple[date, date, str] | None:
    """"last N days"/"past N days" for any N -- not just the fixed 7/30/90 a user might not
    say (this is what "60 days" needed: there was simply no way to ask for it before)."""
    match = re.search(r"(?:last|past)\s+(\d+)\s+days?", question.lower())
    if not match:
        return None
    n = int(match.group(1))
    if n <= 0:
        return None
    start = today - timedelta(days=n)
    return start, today, f"the last {n} days"


def _match_relative_months(question: str, today: date) -> tuple[date, date, str] | None:
    """"last N months"/"past N months" -- a rolling window ending today (not aligned to
    calendar month boundaries; that's what a named month or "this/last month" is for)."""
    match = re.search(r"(?:last|past)\s+(\d+)\s+months?", question.lower())
    if not match:
        return None
    n = int(match.group(1))
    if n <= 0:
        return None
    start = _shift_months(today, -n) + timedelta(days=1)
    return start, today, f"the last {n} months"


def _match_today_yesterday(question: str, today: date) -> tuple[date, date, str] | None:
    """"today"/"yesterday"/"the day before yesterday" -- the most common conversational
    single-day phrases, and until now the only ones with no DATE_RANGE_PHRASES entry and no
    _match_relative_* function at all (every other relative window at least falls through to
    something with a plausible-looking label; these fell all the way through to
    DEFAULT_DATE_RANGE's 30 days with no hint that a single-day question got a month-long
    answer). "day before yesterday" is checked FIRST since it contains "yesterday" as a
    substring -- checking bare "yesterday" first would silently resolve it one day wrong.
    Checked ahead of everything else in match_date_window since a single named day is at
    least as specific a signal as a named month or an explicit "last N days".

    A bare, context-relative "day before" (as in a follow-up like "and day before?", with no
    "yesterday" in it) is NOT handled here -- it means "one day before whatever we were just
    looking at," which needs the previous answer's window as an anchor, not today. See
    _shift_to_day_before() and its use in ask_assistant()."""
    q = question.lower()
    if re.search(r"\bday before yesterday\b", q):
        d = today - timedelta(days=2)
        return d, d, "the day before yesterday"
    if re.search(r"\byesterday\b", q):
        d = today - timedelta(days=1)
        return d, d, "yesterday"
    if re.search(r"\btoday\b", q):
        return today, today, "today"
    return None


def _wants_day_before(question: str) -> bool:
    """Bare "day before"/"the day before"/"day before that" in a follow-up with no metric of
    its own -- see _match_today_yesterday()'s docstring for why this can't be resolved
    against today the way "yesterday" is. Deliberately checks for "day before" rather than
    just "before" -- "before" alone would collide with COMPARE_PHRASES' "period before" (a
    different, length-preserving shift, not a single day)."""
    return "day before" in question.lower()


def _shift_to_day_before(previous_start_date: str) -> tuple[date, date, str]:
    """Always resolves to exactly ONE day immediately preceding the previous answer's window
    start -- regardless of how long that previous window was. "day" explicitly signals a
    single day, unlike "before that"/"previous period" (COMPARE_PHRASES), which preserve the
    previous window's length instead."""
    prev_start = date.fromisoformat(previous_start_date)
    d = prev_start - timedelta(days=1)
    return d, d, d.strftime("%b %d, %Y")


def try_match_date_window(question: str, today: date) -> tuple[date, date, str] | None:
    """Like match_date_window() below, but returns None instead of silently defaulting when
    the question names no recognizable window at all -- the distinction match_date_window()
    itself can't make (it always returns SOMETHING). ask_assistant() needs that distinction
    for a bare follow-up like "and yesterday?": that message names no metric, but DOES name an
    explicit new window, so it should reuse the previous answer's metric with THIS window --
    as opposed to "and the previous period from that?", which names no window at all and
    means "shift the previous window back by its own length" instead (a different, existing
    mechanism -- see ask_assistant()'s docstring). Checked most-specific-first: a single named
    day, a named month, or an explicit "last N days/months" is a deliberate, unambiguous
    signal, so each wins over the more generic idiomatic phrases below."""
    today_yesterday = _match_today_yesterday(question, today)
    if today_yesterday:
        return today_yesterday

    named_month = _match_named_month(question, today)
    if named_month:
        return named_month

    relative_days = _match_relative_days(question, today)
    if relative_days:
        return relative_days

    relative_months = _match_relative_months(question, today)
    if relative_months:
        return relative_months

    q = question.lower()
    for key, phrases in DATE_RANGE_PHRASES:
        if any(phrase in q for phrase in phrases):
            start, end = resolve_date_range(key, today)
            return start, end, DATE_RANGE_LABELS[key]

    return None


def match_date_window(question: str, today: date) -> tuple[date, date, str]:
    """Returns (start, end, display_label), defaulting to DEFAULT_DATE_RANGE when the question
    names no recognizable window -- the right behavior once a metric is already known (a bare
    "what's my revenue" reasonably means "revenue for the usual default window"). See
    try_match_date_window() above for the variant that instead reports "nothing matched"."""
    explicit = try_match_date_window(question, today)
    if explicit:
        return explicit
    start, end = resolve_date_range(DEFAULT_DATE_RANGE, today)
    return start, end, DATE_RANGE_LABELS[DEFAULT_DATE_RANGE]


def wants_compare(question: str) -> bool:
    q = question.lower()
    return any(phrase in q for phrase in COMPARE_PHRASES)


# Word-boundary regex, unlike every other phrase list in this file (which is deliberately
# plain substring containment -- see the module docstring). A bare "hi" as a substring would
# false-match "which"/"this"/"shipping"/"achieve", so greeting words specifically need \b.
# Checked ONLY as an alternative to the final "I don't recognize that" rejection in
# ask_assistant() below -- never before metric matching -- so a real business question that
# happens to start with "hi" (e.g. "hi, what's my revenue today") still matches its metric
# first and never reaches this at all.
GREETING_PATTERNS = [
    r"\bhi\b", r"\bhello\b", r"\bhey\b", r"\bhowdy\b",
    r"\bthanks\b", r"\bthank you\b",
    r"\bwhat can you (help with|do)\b",
]


def is_greeting(question: str) -> bool:
    q = question.lower()
    return any(re.search(pattern, q) for pattern in GREETING_PATTERNS)


def _format_value(value, fmt: str) -> str:
    if value is None:
        return "not available"
    if fmt == "currency":
        return f"${value:,.2f}"
    if fmt == "percent":
        return f"{value * 100:.1f}%"
    if fmt == "ratio":
        return f"{value:.2f}x"
    return f"{value:,.0f}"


def _metric_definition(key: str) -> dict:
    for registry in (SCALAR_METRICS, SERIES_METRICS, TABLE_METRICS):
        if key in registry:
            return registry[key]
    raise KeyError(key)


def ask_assistant(
    db,
    tenant_id,
    message: str,
    previous_metric: str | None = None,
    previous_start_date: str | None = None,
    previous_end_date: str | None = None,
    is_demo: bool = False,
) -> dict:
    """The whole request/response cycle: match, look up, template a sentence. No LLM
    involved, so there's nothing here that can sample a different answer to the same
    question twice, or misread which direction a number moved.

    previous_metric/previous_start_date/previous_end_date are optional, frontend-supplied
    context: the metric and window the LAST answer was about (AssistantPage.tsx tracks just
    that one slot, not a full conversation history). They only ever matter when THIS question
    has no metric of its own -- and there are two different shapes of follow-up that can mean:

      - "and yesterday?" / "what about last week?" names an explicit NEW window but no
        metric -- reuse the previous answer's metric with THIS window (try_match_date_window()
        finding something real is exactly what tells the two shapes apart below).
      - "and for the previous period from that?" names no window at all, just intent -- reuse
        the previous metric with its window shifted back by its own length, the same
        "same-length prior period" math compute_metric's own compare= already does, just
        returned as a fresh answer instead of a delta tacked onto the original one.

    A question can also ask for a comparison without naming a metric at all -- "give me the
    comparison for last 30 days with the previous 30 days" says what periods, but not what
    number. Rather than fail that outright, it defaults to net_revenue, the same "headline
    number" convention a bare "revenue"/"sales" mention already gets in METRIC_PHRASES -- and
    the reply always names the metric it used ("Net Revenue for..."), so it's never silently
    guessing without saying what it guessed.

    is_demo disables the optional Groq classifier below for the public "View live demo"
    account specifically, so public traffic can never silently burn API quota/cost even when
    a real key is configured."""
    metric_key = match_metric(message)
    today = date.today()
    all_metric_keys = set(SCALAR_METRICS) | set(SERIES_METRICS) | set(TABLE_METRICS)
    has_previous_context = previous_metric in all_metric_keys and previous_start_date and previous_end_date
    ai_assisted = False

    if metric_key is not None:
        start_date, end_date, window = match_date_window(message, today)
        compare = wants_compare(message) and metric_key in SCALAR_METRICS
    elif has_previous_context and (new_window := try_match_date_window(message, today)):
        metric_key = previous_metric
        start_date, end_date, window = new_window
        compare = wants_compare(message) and metric_key in SCALAR_METRICS
    elif has_previous_context and _wants_day_before(message):
        try:
            start_date, end_date, window = _shift_to_day_before(previous_start_date)
        except ValueError:
            return {
                "reply": "I don't recognize that question yet -- try asking about a specific number and period.",
                "results": [],
            }
        metric_key = previous_metric
        compare = False
    elif has_previous_context and wants_compare(message):
        try:
            prev_start = date.fromisoformat(previous_start_date)
            prev_end = date.fromisoformat(previous_end_date)
        except ValueError:
            return {
                "reply": "I don't recognize that question yet -- try asking about a specific number and period.",
                "results": [],
            }
        metric_key = previous_metric
        period_length = (prev_end - prev_start).days + 1
        end_date = prev_start - timedelta(days=1)
        start_date = end_date - timedelta(days=period_length - 1)
        window = f"{start_date.strftime('%b %d')} - {end_date.strftime('%b %d, %Y')}"
        compare = False
    elif wants_compare(message):
        metric_key = "net_revenue"
        start_date, end_date, window = match_date_window(message, today)
        compare = True
    elif is_greeting(message):
        # A different kind of miss than a genuinely unrecognized business question -- "hi" or
        # "thanks" getting the same "I don't recognize that question yet" copy reads oddly, so
        # this gets its own reply instead. Checked last, after every real match attempt above
        # (including the compare-with-no-metric branch), so it can never preempt an actual
        # question that happens to also contain a greeting word.
        return {
            "reply": (
                "Hi! Ask me about your revenue, orders, ad spend, or inventory -- try one of "
                "the suggestions below to get started."
            ),
            "results": [],
        }
    elif (
        settings.groq_api_key
        and not is_demo
        and rate_limit_allow(f"groq-fallback:{tenant_id}", GROQ_FALLBACK_MAX_CALLS_PER_HOUR, 3600)
        and (
            classified := classify_via_groq(
                message,
                metric_options=[m for cat in build_capabilities() for m in cat["metrics"]],
                date_keys=list(DATE_RANGE_LABELS) + ["today", "yesterday"],
            )
        )
    ):
        # Groq only ever SELECTS one of the keys just handed to it above (validated against
        # them inside classify_via_groq() -- never trusted blindly); the actual date-range
        # resolution below reuses the exact same resolve_date_range()/today-yesterday logic
        # every deterministic branch already uses, and the number/direction word further down
        # still come from the same compute_metric() call every other branch makes.
        metric_key = classified["metric_key"]
        date_range_key = classified["date_range_key"]
        if date_range_key == "today":
            start_date = end_date = today
            window = "today"
        elif date_range_key == "yesterday":
            start_date = end_date = today - timedelta(days=1)
            window = "yesterday"
        elif date_range_key in DATE_RANGE_LABELS:
            start_date, end_date = resolve_date_range(date_range_key, today)
            window = DATE_RANGE_LABELS[date_range_key]
        else:
            start_date, end_date = resolve_date_range(DEFAULT_DATE_RANGE, today)
            window = DATE_RANGE_LABELS[DEFAULT_DATE_RANGE]
        compare = wants_compare(message) and metric_key in SCALAR_METRICS
        ai_assisted = True
    else:
        return {
            "reply": (
                "I don't recognize that question yet -- try one of the suggestions below, "
                "or ask about a specific number like revenue, orders, ad spend, or inventory."
            ),
            "results": [],
        }

    result = compute_metric(db, tenant_id, metric_key, start_date, end_date, compare=compare)
    result["start_date"] = start_date.isoformat()
    result["end_date"] = end_date.isoformat()

    label = result["label"]

    if metric_key in TABLE_METRICS or metric_key in SERIES_METRICS:
        reply = f"Here's your {label.lower()} for {window}."
    else:
        metric_def = _metric_definition(metric_key)
        value_text = _format_value(result.get("value"), metric_def.get("format", "count"))
        reply = f"{label} for {window} was {value_text}."
        delta_pct = result.get("delta_pct")
        if compare and delta_pct is not None:
            direction = "up" if delta_pct >= 0 else "down"
            reply += f" That's {direction} {abs(delta_pct) * 100:.1f}% vs the previous period."

    if ai_assisted:
        # Same transparency principle as the compare-with-no-metric branch above (which
        # already names the metric it defaulted to rather than guessing silently): the user
        # can always tell an AI-classified answer apart from a deterministic phrase match.
        reply = f"Not 100% sure, but here's my best guess: {reply}"

    return {"reply": reply, "results": [result]}
