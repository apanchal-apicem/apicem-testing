// Ports backend/tests/test_groq_fallback.py -- pure logic, no DB, no real network call. Every
// test mocks the global fetch directly (vi.stubGlobal), matching the Python version's
// approach of mocking httpx.post rather than reaching for a network-mocking library.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { classifyViaGroq } from "../src/groqFallback.js";
import { settings } from "../src/config.js";

const METRIC_OPTIONS = [
  { key: "net_revenue", label: "Net Revenue" },
  { key: "total_ad_spend", label: "Total Ad Spend" },
];
const DATE_KEYS = ["last_7_days", "last_30_days", "today", "yesterday"];

function fakeResponse(content: string, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => ({ choices: [{ message: { content } }] }),
  } as Response;
}

let originalKey: string;

beforeEach(() => {
  originalKey = settings.groqApiKey;
});

afterEach(() => {
  (settings as { groqApiKey: string }).groqApiKey = originalKey;
  vi.unstubAllGlobals();
});

describe("classifyViaGroq", () => {
  it("returns null when no API key is configured", async () => {
    (settings as { groqApiKey: string }).groqApiKey = "";
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await classifyViaGroq("show me my numbers", METRIC_OPTIONS, DATE_KEYS);
    expect(result).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns the valid response", async () => {
    (settings as { groqApiKey: string }).groqApiKey = "fake-key-for-testing";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(fakeResponse('{"metric_key": "net_revenue", "date_range_key": "last_7_days"}')),
    );
    const result = await classifyViaGroq("how'd i do lately", METRIC_OPTIONS, DATE_KEYS);
    expect(result).toEqual({ metric_key: "net_revenue", date_range_key: "last_7_days" });
  });

  it("discards an out-of-enum metric_key rather than trusting it", async () => {
    // The single most important test in this module: proves the model cannot fabricate a
    // metric that doesn't exist -- validation against the caller's own known set is the
    // safety boundary, not the prompt.
    (settings as { groqApiKey: string }).groqApiKey = "fake-key-for-testing";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(fakeResponse('{"metric_key": "made_up_metric", "date_range_key": "last_7_days"}')),
    );
    const result = await classifyViaGroq("some question", METRIC_OPTIONS, DATE_KEYS);
    expect(result).toBeNull();
  });

  it("drops an out-of-enum date key but still uses the metric", async () => {
    (settings as { groqApiKey: string }).groqApiKey = "fake-key-for-testing";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(fakeResponse('{"metric_key": "net_revenue", "date_range_key": "next_tuesday"}')),
    );
    const result = await classifyViaGroq("some question", METRIC_OPTIONS, DATE_KEYS);
    expect(result).toEqual({ metric_key: "net_revenue", date_range_key: null });
  });

  it("returns null for a null metric_key", async () => {
    (settings as { groqApiKey: string }).groqApiKey = "fake-key-for-testing";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse('{"metric_key": null, "date_range_key": null}')));
    const result = await classifyViaGroq("asdkfjaslkdfj", METRIC_OPTIONS, DATE_KEYS);
    expect(result).toBeNull();
  });

  it("returns null on a network error, not a crash", async () => {
    (settings as { groqApiKey: string }).groqApiKey = "fake-key-for-testing";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("simulated network failure")),
    );
    const result = await classifyViaGroq("some question", METRIC_OPTIONS, DATE_KEYS);
    expect(result).toBeNull();
  });

  it("returns null on a non-200 response", async () => {
    (settings as { groqApiKey: string }).groqApiKey = "fake-key-for-testing";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse("", false, 500)));
    const result = await classifyViaGroq("some question", METRIC_OPTIONS, DATE_KEYS);
    expect(result).toBeNull();
  });

  it("returns null on malformed JSON content", async () => {
    (settings as { groqApiKey: string }).groqApiKey = "fake-key-for-testing";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse("not valid json at all")));
    const result = await classifyViaGroq("some question", METRIC_OPTIONS, DATE_KEYS);
    expect(result).toBeNull();
  });
});
