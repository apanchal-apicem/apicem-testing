"""Optional last-resort intent CLASSIFIER for Ask Apicem Engine, using Groq's fast hosted
inference. See assistant_intents.py's module docstring for why the assistant is otherwise
fully deterministic, and why this exists without reintroducing the risk that caused an earlier
Ollama-based version to be removed: this module only ever SELECTS one of the caller's own
already-defined metric/date keys -- it never computes or states a number, never picks a
direction word, never phrases anything the user sees. Every one of those still comes from the
exact same compute_metric() SQL path and reply-templating code every other question uses.

Deliberately has NO import from assistant_intents.py (avoids a circular import, since that
module imports classify_via_groq() from here) -- the caller passes in whatever metric/date
keys are valid right now, and this module treats them as opaque strings to validate against.
Disabled by default (settings.groq_api_key blank, see config.py) -- classify_via_groq() then
never even attempts a network call.
"""
import json
import logging

import httpx

from .config import settings

logger = logging.getLogger(__name__)

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
REQUEST_TIMEOUT_SECONDS = 8


def _build_prompt(message: str, metric_options: list[dict], date_keys: list[str]) -> str:
    metric_lines = "\n".join(f'- "{m["key"]}": {m["label"]}' for m in metric_options)
    date_key_list = ", ".join(f'"{k}"' for k in date_keys)
    return (
        "You are classifying a business owner's question for an analytics app into a FIXED "
        "set of known metrics and date ranges. Do not compute or state any number -- only "
        "identify which of the following the question is asking about.\n\n"
        f"Known metrics:\n{metric_lines}\n\n"
        f"Known date ranges: {date_key_list}\n\n"
        "Reply with ONLY a JSON object of this exact shape, no other text:\n"
        '{"metric_key": "<one of the metric keys above, or null if none clearly fits>", '
        '"date_range_key": "<one of the date ranges above, or null if none is mentioned>"}\n\n'
        f'Question: "{message}"'
    )


def classify_via_groq(
    message: str, metric_options: list[dict], date_keys: list[str]
) -> dict | None:
    """metric_options: [{"key": ..., "label": ...}, ...] -- every metric currently answerable.
    date_keys: every date-range key currently resolvable.

    Returns {"metric_key": str, "date_range_key": str | None} only when metric_key validates
    against metric_options -- date_range_key is returned as-is if it validates against
    date_keys, else None (the caller decides what "no date mentioned" should default to, same
    as every other branch in ask_assistant() already does). Returns None on ANY failure: no
    API key configured, network error, timeout, non-200 response, malformed JSON, or a
    metric_key that isn't one of the real, known keys. Never raises -- a failure here must
    always look identical to "the classifier also couldn't figure it out," which falls
    through to the same honest rejection every other unrecognized question gets.
    """
    if not settings.groq_api_key:
        return None

    valid_metric_keys = {m["key"] for m in metric_options}

    try:
        response = httpx.post(
            GROQ_API_URL,
            headers={"Authorization": f"Bearer {settings.groq_api_key}"},
            json={
                "model": settings.groq_model,
                "messages": [
                    {"role": "user", "content": _build_prompt(message, metric_options, date_keys)}
                ],
                "response_format": {"type": "json_object"},
                "temperature": 0,
            },
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        parsed = json.loads(content)
    except Exception:
        logger.exception("Groq classification call failed; falling back to the honest rejection")
        return None

    metric_key = parsed.get("metric_key")
    if metric_key not in valid_metric_keys:
        # This is the safety boundary, not the prompt: a model that ignores instructions and
        # names something outside the real set is discarded here, same as a network failure --
        # it can never introduce a fabricated metric into what the user sees.
        return None

    date_range_key = parsed.get("date_range_key")
    if date_range_key not in date_keys:
        date_range_key = None

    return {"metric_key": metric_key, "date_range_key": date_range_key}
