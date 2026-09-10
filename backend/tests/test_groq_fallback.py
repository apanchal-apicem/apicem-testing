"""Pure logic, no DB, no real network call -- every test here mocks httpx.post directly (via
monkeypatch, matching this repo's existing lack of an httpx-mocking library rather than
introducing one). See conftest.py's _disable_real_groq_calls autouse fixture for why the whole
suite never depends on whatever GROQ_API_KEY happens to be in a developer's local .env.
"""
import httpx
import pytest

from app import groq_fallback
from app.groq_fallback import classify_via_groq

METRIC_OPTIONS = [
    {"key": "net_revenue", "label": "Net Revenue"},
    {"key": "total_ad_spend", "label": "Total Ad Spend"},
]
DATE_KEYS = ["last_7_days", "last_30_days", "today", "yesterday"]


class _FakeResponse:
    def __init__(self, content: str, status_code: int = 200):
        self._content = content
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"simulated HTTP {self.status_code}")

    def json(self):
        return {"choices": [{"message": {"content": self._content}}]}


def test_returns_none_when_no_api_key_configured(monkeypatch):
    monkeypatch.setattr(groq_fallback.settings, "groq_api_key", "")

    def _should_never_be_called(*args, **kwargs):
        raise AssertionError("httpx.post must not be called when no API key is configured")

    monkeypatch.setattr(httpx, "post", _should_never_be_called)
    assert classify_via_groq("show me my numbers", METRIC_OPTIONS, DATE_KEYS) is None


def test_valid_response_is_returned(monkeypatch):
    monkeypatch.setattr(groq_fallback.settings, "groq_api_key", "fake-key-for-testing")
    monkeypatch.setattr(
        httpx, "post",
        lambda *a, **k: _FakeResponse('{"metric_key": "net_revenue", "date_range_key": "last_7_days"}'),
    )
    result = classify_via_groq("how'd i do lately", METRIC_OPTIONS, DATE_KEYS)
    assert result == {"metric_key": "net_revenue", "date_range_key": "last_7_days"}


def test_out_of_enum_metric_key_is_discarded_not_trusted(monkeypatch):
    # The single most important test in this module: proves the model cannot fabricate a
    # metric that doesn't exist -- validation against the caller's own known set is the
    # safety boundary, not the prompt.
    monkeypatch.setattr(groq_fallback.settings, "groq_api_key", "fake-key-for-testing")
    monkeypatch.setattr(
        httpx, "post",
        lambda *a, **k: _FakeResponse('{"metric_key": "made_up_metric", "date_range_key": "last_7_days"}'),
    )
    assert classify_via_groq("some question", METRIC_OPTIONS, DATE_KEYS) is None


def test_out_of_enum_date_key_is_dropped_but_metric_still_used(monkeypatch):
    monkeypatch.setattr(groq_fallback.settings, "groq_api_key", "fake-key-for-testing")
    monkeypatch.setattr(
        httpx, "post",
        lambda *a, **k: _FakeResponse('{"metric_key": "net_revenue", "date_range_key": "next_tuesday"}'),
    )
    result = classify_via_groq("some question", METRIC_OPTIONS, DATE_KEYS)
    assert result == {"metric_key": "net_revenue", "date_range_key": None}


def test_null_metric_key_returns_none(monkeypatch):
    monkeypatch.setattr(groq_fallback.settings, "groq_api_key", "fake-key-for-testing")
    monkeypatch.setattr(
        httpx, "post",
        lambda *a, **k: _FakeResponse('{"metric_key": null, "date_range_key": null}'),
    )
    assert classify_via_groq("asdkfjaslkdfj", METRIC_OPTIONS, DATE_KEYS) is None


def test_network_error_returns_none_not_a_crash(monkeypatch):
    monkeypatch.setattr(groq_fallback.settings, "groq_api_key", "fake-key-for-testing")

    def _raise(*a, **k):
        raise httpx.ConnectTimeout("simulated timeout")

    monkeypatch.setattr(httpx, "post", _raise)
    assert classify_via_groq("some question", METRIC_OPTIONS, DATE_KEYS) is None


def test_non_200_response_returns_none(monkeypatch):
    monkeypatch.setattr(groq_fallback.settings, "groq_api_key", "fake-key-for-testing")
    monkeypatch.setattr(httpx, "post", lambda *a, **k: _FakeResponse("", status_code=500))
    assert classify_via_groq("some question", METRIC_OPTIONS, DATE_KEYS) is None


def test_malformed_json_content_returns_none(monkeypatch):
    monkeypatch.setattr(groq_fallback.settings, "groq_api_key", "fake-key-for-testing")
    monkeypatch.setattr(httpx, "post", lambda *a, **k: _FakeResponse("not valid json at all"))
    assert classify_via_groq("some question", METRIC_OPTIONS, DATE_KEYS) is None
