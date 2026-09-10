"""API-level (unlike test_assistant_intents.py's pure-logic tests) since these exercise the
full /assistant/ask -> compute_metric -> DB round trip, but deliberately against a freshly
signed-up tenant with NO connection synced -- compute_metric's SQL is coalesce(sum(...), 0),
so an empty tenant still returns a real $0.00 answer rather than an error, which is enough to
tell a genuine reply apart from the rejection message without waiting on the orchestrator's
async sync (nothing else in tests/ does that either -- see test_connections.py).
"""


def test_ask_then_followup_with_no_metric_reuses_previous_context(client, auth_headers):
    # Regression test for a real user-reported bug: "what is the revenue today" got a correct
    # answer, but the very next message "and yesterday?" hit the generic "I don't recognize
    # that question yet" rejection instead of reusing net_revenue with yesterday's window.
    # Root cause: the single-slot follow-up mechanism only reused previous_metric when the
    # follow-up contained compare-language ("and the previous period from that?") -- a
    # follow-up naming an explicit NEW window but no metric ("and yesterday?") matched neither
    # a metric nor compare-language, so it fell straight to the rejection. AssistantPage.tsx
    # always sends the last answer's context on every subsequent request, so this reproduces
    # the exact request shape the frontend actually sends.
    first = client.post("/assistant/ask", json={"message": "what is the revenue today"}, headers=auth_headers)
    assert first.status_code == 200, first.text
    first_body = first.json()
    assert first_body["results"], "expected a matched result, not a rejection, for the first question"
    first_result = first_body["results"][0]
    assert first_result["metric"] == "net_revenue"

    followup = client.post(
        "/assistant/ask",
        json={
            "message": "and yesterday?",
            "previous_metric": first_result["metric"],
            "previous_start_date": first_result["start_date"],
            "previous_end_date": first_result["end_date"],
        },
        headers=auth_headers,
    )
    assert followup.status_code == 200, followup.text
    followup_body = followup.json()
    assert followup_body["results"], (
        f"follow-up was rejected instead of reusing context: {followup_body['reply']!r}"
    )
    followup_result = followup_body["results"][0]
    assert followup_result["metric"] == "net_revenue"
    assert followup_result["start_date"] == followup_result["end_date"], "yesterday is a single day"
    assert followup_result["start_date"] != first_result["start_date"], "must resolve to a DIFFERENT day, not reuse today's"


def test_ask_followup_day_before_yesterday_reuses_previous_metric(client, auth_headers):
    # Real user-reported follow-up to the previous bug: "what is the revenue today" -> "and
    # yesterday?" both worked, but "and day before ?" (no "yesterday" in it) still hit the
    # rejection -- "day before" is relative to the PREVIOUS answer's window, not to today, so
    # it needed its own mechanism (_wants_day_before/_shift_to_day_before) rather than being
    # resolvable by try_match_date_window, which only knows about today.
    first = client.post("/assistant/ask", json={"message": "what is the revenue today"}, headers=auth_headers)
    first_result = first.json()["results"][0]

    second = client.post(
        "/assistant/ask",
        json={
            "message": "and yesterday?",
            "previous_metric": first_result["metric"],
            "previous_start_date": first_result["start_date"],
            "previous_end_date": first_result["end_date"],
        },
        headers=auth_headers,
    )
    second_result = second.json()["results"][0]

    third = client.post(
        "/assistant/ask",
        json={
            "message": "and day before ?",
            "previous_metric": second_result["metric"],
            "previous_start_date": second_result["start_date"],
            "previous_end_date": second_result["end_date"],
        },
        headers=auth_headers,
    )
    assert third.status_code == 200, third.text
    third_body = third.json()
    assert third_body["results"], f"follow-up was rejected: {third_body['reply']!r}"
    third_result = third_body["results"][0]
    assert third_result["metric"] == "net_revenue"
    assert third_result["start_date"] == third_result["end_date"], "day before is a single day"
    assert third_result["start_date"] < second_result["start_date"], "must resolve to a day BEFORE yesterday"


def test_ask_followup_without_any_context_still_rejects(client, auth_headers):
    # The frontend always sends context after a successful answer, but a client that doesn't
    # (or the very first message in a session) must still get the honest rejection rather than
    # a guess -- this is what keeps the fix from turning into "always assume some metric."
    response = client.post("/assistant/ask", json={"message": "and yesterday?"}, headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["results"] == []


def test_groq_fallback_is_used_when_configured_and_classifier_matches(client, auth_headers, monkeypatch):
    # conftest.py's autouse _disable_real_groq_calls fixture blanks settings.groq_api_key for
    # the whole suite -- restore a fake one here AND mock classify_via_groq directly (never the
    # real network) to exercise ask_assistant()'s Groq branch specifically.
    from app import assistant_intents

    monkeypatch.setattr(assistant_intents.settings, "groq_api_key", "fake-key-for-testing")
    monkeypatch.setattr(
        assistant_intents,
        "classify_via_groq",
        lambda message, metric_options, date_keys: {"metric_key": "net_revenue", "date_range_key": "today"},
    )
    response = client.post(
        "/assistant/ask", json={"message": "some oddly phrased business question"}, headers=auth_headers
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["results"], f"expected a matched result via the Groq branch, got: {body['reply']!r}"
    assert body["results"][0]["metric"] == "net_revenue"
    # Transparency: an AI-classified answer must read differently from a deterministic one.
    assert "best guess" in body["reply"].lower()


def test_groq_fallback_never_called_for_demo_account(monkeypatch):
    # is_demo=True must skip the Groq branch entirely, even with a key configured and even
    # when the classifier would otherwise have matched -- public demo traffic must never
    # silently burn API quota/cost.
    from app import assistant_intents

    monkeypatch.setattr(assistant_intents.settings, "groq_api_key", "fake-key-for-testing")

    def _should_never_be_called(*args, **kwargs):
        raise AssertionError("classify_via_groq must not be called for the demo account")

    monkeypatch.setattr(assistant_intents, "classify_via_groq", _should_never_be_called)

    outcome = assistant_intents.ask_assistant(
        db=None, tenant_id="irrelevant-for-this-test",
        message="some oddly phrased business question", is_demo=True,
    )
    assert outcome["results"] == []
    assert "don't recognize" in outcome["reply"].lower()


def test_groq_fallback_skipped_when_classifier_returns_none(client, auth_headers, monkeypatch):
    # When Groq is configured but also can't classify the question (mocked here as returning
    # None, same as any real failure per test_groq_fallback.py), the honest rejection still
    # applies -- never a crash, never a fabricated guess.
    from app import assistant_intents

    monkeypatch.setattr(assistant_intents.settings, "groq_api_key", "fake-key-for-testing")
    monkeypatch.setattr(assistant_intents, "classify_via_groq", lambda *a, **k: None)

    response = client.post(
        "/assistant/ask", json={"message": "some oddly phrased business question"}, headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["results"] == []
