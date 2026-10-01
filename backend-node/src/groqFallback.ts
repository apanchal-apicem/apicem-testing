// Ports backend/app/groq_fallback.py exactly. Optional last-resort intent CLASSIFIER for Ask
// Apicem Engine -- see assistantIntents.ts's module comment for why the assistant is
// otherwise fully deterministic. This module only ever SELECTS one of the caller's own
// already-defined metric/date keys -- it never computes or states a number, never picks a
// direction word, never phrases anything the user sees.
//
// Deliberately has NO import from assistantIntents.ts (avoids a circular import, since that
// module imports classifyViaGroq() from here) -- the caller passes in whatever metric/date
// keys are valid right now, and this module treats them as opaque strings to validate
// against. Disabled by default (settings.groqApiKey blank) -- classifyViaGroq() then never
// even attempts a network call. Uses Node's built-in fetch (no httpx-equivalent dependency
// needed).
import { settings } from "./config.js";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 8000;

export interface MetricOption {
  key: string;
  label: string;
}

export interface GroqClassification {
  metric_key: string;
  date_range_key: string | null;
}

function buildPrompt(message: string, metricOptions: MetricOption[], dateKeys: string[]): string {
  const metricLines = metricOptions.map((m) => `- "${m.key}": ${m.label}`).join("\n");
  const dateKeyList = dateKeys.map((k) => `"${k}"`).join(", ");
  return (
    "You are classifying a business owner's question for an analytics app into a FIXED " +
    "set of known metrics and date ranges. Do not compute or state any number -- only " +
    "identify which of the following the question is asking about.\n\n" +
    `Known metrics:\n${metricLines}\n\n` +
    `Known date ranges: ${dateKeyList}\n\n` +
    "Reply with ONLY a JSON object of this exact shape, no other text:\n" +
    '{"metric_key": "<one of the metric keys above, or null if none clearly fits>", ' +
    '"date_range_key": "<one of the date ranges above, or null if none is mentioned>"}\n\n' +
    `Question: "${message}"`
  );
}

/**
 * metricOptions: every metric currently answerable. dateKeys: every date-range key currently
 * resolvable.
 *
 * Returns {metric_key, date_range_key} only when metric_key validates against metricOptions --
 * date_range_key is returned as-is if it validates against dateKeys, else null (the caller
 * decides what "no date mentioned" should default to, same as every other branch in
 * askAssistant() already does). Returns null on ANY failure: no API key configured, network
 * error, timeout, non-200 response, malformed JSON, or a metric_key that isn't one of the
 * real, known keys. Never throws -- a failure here must always look identical to "the
 * classifier also couldn't figure it out," which falls through to the same honest rejection
 * every other unrecognized question gets.
 */
export async function classifyViaGroq(
  message: string,
  metricOptions: MetricOption[],
  dateKeys: string[],
): Promise<GroqClassification | null> {
  if (!settings.groqApiKey) return null;

  const validMetricKeys = new Set(metricOptions.map((m) => m.key));

  const candidateModels = Array.from(
    new Set([settings.groqModel || "openai/gpt-oss-20b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"]),
  );

  let parsed: { metric_key?: unknown; date_range_key?: unknown } | null = null;
  for (const model of candidateModels) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let response: Response;
      try {
        response = await fetch(GROQ_API_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${settings.groqApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: buildPrompt(message, metricOptions, dateKeys) }],
            response_format: { type: "json_object" },
            temperature: 0,
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      if (!response.ok) {
        const errText = await response.text();
        console.warn(`[GROQ_WARN] Model "${model}" returned ${response.status}, trying fallback:`, errText);
        continue;
      }
      const body = (await response.json()) as { choices: { message: { content: string } }[] };
      parsed = JSON.parse(body.choices[0].message.content);
      if (parsed) break;
    } catch (err) {
      console.warn(`[GROQ_WARN] Model "${model}" request error, trying fallback:`, err);
    }
  }

  if (!parsed) {
    console.error("All Groq classification models failed; falling back to the honest rejection");
    return null;
  }

  const metricKey = parsed.metric_key;
  if (typeof metricKey !== "string" || !validMetricKeys.has(metricKey)) {
    // This is the safety boundary, not the prompt: a model that ignores instructions and
    // names something outside the real set is discarded here, same as a network failure --
    // it can never introduce a fabricated metric into what the user sees.
    return null;
  }

  const dateRangeKeyRaw = parsed.date_range_key;
  const dateRangeKey = typeof dateRangeKeyRaw === "string" && dateKeys.includes(dateRangeKeyRaw) ? dateRangeKeyRaw : null;

  return { metric_key: metricKey, date_range_key: dateRangeKey };
}
