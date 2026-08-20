"""Tool-calling orchestration for the self-hosted analytics assistant (doc Sec 9 update,
2026-08-20). Talks to a local Ollama server -- no third-party API, nothing leaves this
machine. The model is only ever given ONE tool: look up an existing metric by key + a named
date range. It never sees a tenant_id and never constructs SQL -- the tenant comes from the
authenticated session server-side, exactly like every other endpoint in this app, and the
actual query always goes through metric_registry.compute_metric(), the same function every
dashboard already calls. This means the assistant can't answer anything a dashboard couldn't
already show; it can only phrase the request differently and pick the metric/range for you.
"""
import logging
from datetime import date, timedelta

import requests

from .config import settings
from .metric_registry import SCALAR_METRICS, SERIES_METRICS, TABLE_METRICS, compute_metric

logger = logging.getLogger("apicem")

MAX_TOOL_ITERATIONS = 4
REQUEST_TIMEOUT_SECONDS = 120  # CPU-only local inference can genuinely take this long.

DATE_RANGE_KEYS = [
    "last_7_days",
    "last_30_days",
    "last_90_days",
    "this_month",
    "last_month",
    "this_year",
    "last_year",
    "same_period_last_year",
]

ALL_METRIC_KEYS = list(SCALAR_METRICS) + list(SERIES_METRICS) + list(TABLE_METRICS)


def _shift_years(d: date, years: int) -> date:
    try:
        return d.replace(year=d.year + years)
    except ValueError:
        # Feb 29 doesn't exist in the target year -- fall back a day, same convention
        # used for a leap-day birthday.
        return d.replace(year=d.year + years, day=28)


def resolve_date_range(key: str, today: date) -> tuple[date, date]:
    """Date arithmetic happens here, server-side and deterministic -- never left to the
    model's own math, since that's the single most common way a small local model gets this
    class of question wrong."""
    if key == "last_7_days":
        return today - timedelta(days=6), today
    if key == "last_30_days":
        return today - timedelta(days=29), today
    if key == "last_90_days":
        return today - timedelta(days=89), today
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
        # default), shifted back exactly one year -- "how did the same ~30 days look last
        # year." If the user wants a different comparison (e.g. this month vs. same month
        # last year), the model can call the tool twice (once for each range) and compare
        # the two results itself in its final answer.
        return _shift_years(today - timedelta(days=29), -1), _shift_years(today, -1)
    raise ValueError(f"unknown date_range: {key}")


def _metric_label(key: str) -> str:
    for registry in (SCALAR_METRICS, SERIES_METRICS, TABLE_METRICS):
        if key in registry:
            return registry[key]["label"]
    return key


def build_tool_schema() -> list[dict]:
    return [
        {
            "type": "function",
            "function": {
                "name": "get_metric",
                "description": (
                    "Look up one of this business's existing metrics for a date range. "
                    "Covers sales/revenue, advertising, and inventory."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "metric_key": {"type": "string", "enum": ALL_METRIC_KEYS},
                        "date_range": {"type": "string", "enum": DATE_RANGE_KEYS},
                        "compare_to_previous_period": {
                            "type": "boolean",
                            "description": (
                                "Only meaningful for a single-number metric. Compares "
                                "against the immediately preceding period of the same "
                                "length (e.g. this month vs. last month) -- NOT year-over-"
                                "year. For a year-over-year question, call this tool twice "
                                "instead: once with date_range=same_period_last_year and "
                                "once with the current period, then compare the two values."
                            ),
                        },
                    },
                    "required": ["metric_key", "date_range"],
                },
            },
        }
    ]


def build_system_prompt(today: date) -> str:
    metric_lines = "\n".join(f"- {key}: {_metric_label(key)}" for key in ALL_METRIC_KEYS)
    return (
        f"You are Apicem's analytics assistant. Today's date is {today.isoformat()}. "
        "Answer the user's question about their business data by calling the get_metric "
        "tool -- never guess a number yourself. Pick the metric_key that best matches what "
        "they're asking about from this list:\n"
        f"{metric_lines}\n\n"
        "If a question needs more than one metric or period (e.g. a year-over-year "
        "comparison), call the tool multiple times before answering. Keep your final "
        "answer short and direct -- lead with the number, in plain business language, not "
        "a data dump. If nothing in the metric list matches what they're asking, say so "
        "plainly instead of picking the closest-sounding one."
    )


def _execute_tool_call(db, tenant_id, today: date, name: str, arguments: dict) -> dict:
    if name != "get_metric":
        return {"error": f"unknown tool: {name}"}
    metric_key = arguments.get("metric_key")
    date_range = arguments.get("date_range")
    if metric_key not in ALL_METRIC_KEYS:
        return {"error": f"unknown metric_key: {metric_key}", "valid_options": ALL_METRIC_KEYS}
    try:
        start_date, end_date = resolve_date_range(date_range, today)
    except ValueError:
        return {"error": f"unknown date_range: {date_range}", "valid_options": DATE_RANGE_KEYS}

    compare = bool(arguments.get("compare_to_previous_period")) and metric_key in SCALAR_METRICS
    result = compute_metric(db, tenant_id, metric_key, start_date, end_date, compare=compare)
    result["start_date"] = start_date.isoformat()
    result["end_date"] = end_date.isoformat()
    return result


def _ollama_chat(messages: list[dict], tools: list[dict]) -> dict:
    try:
        response = requests.post(
            f"{settings.ollama_host}/api/chat",
            json={"model": settings.ollama_model, "messages": messages, "tools": tools, "stream": False},
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except requests.exceptions.ConnectionError:
        raise RuntimeError(
            "The local AI assistant isn't reachable. Make sure Ollama is running "
            f"({settings.ollama_host}) and the {settings.ollama_model} model is pulled."
        )
    except requests.exceptions.Timeout:
        raise RuntimeError("The local AI assistant took too long to respond. Try a shorter question.")
    if response.status_code != 200:
        logger.error("Ollama returned %s: %s", response.status_code, response.text[:500])
        raise RuntimeError("The local AI assistant returned an unexpected error.")
    return response.json()


def ask_assistant(db, tenant_id, message: str, history: list[dict]) -> str:
    today = date.today()
    tools = build_tool_schema()
    messages = [{"role": "system", "content": build_system_prompt(today)}]
    messages.extend(history)
    messages.append({"role": "user", "content": message})

    for _ in range(MAX_TOOL_ITERATIONS):
        data = _ollama_chat(messages, tools)
        reply = data.get("message", {})
        tool_calls = reply.get("tool_calls") or []
        messages.append({"role": "assistant", "content": reply.get("content", ""), "tool_calls": tool_calls})

        if not tool_calls:
            return reply.get("content", "").strip() or "I couldn't come up with an answer to that."

        for call in tool_calls:
            function = call.get("function", {})
            arguments = function.get("arguments") or {}
            result = _execute_tool_call(db, tenant_id, today, function.get("name"), arguments)
            messages.append({"role": "tool", "content": str(result)})

    return "That question needed more steps than I could work through -- try breaking it into a simpler one."
