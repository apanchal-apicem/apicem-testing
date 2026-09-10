// Ports backend/tests/test_assistant_intents.py assertion-for-assertion -- pure logic, no DB,
// same reason the Python version is pure-logic too (date-range/metric/compare matching never
// touches Postgres). This is the largest single module in the whole rewrite (its Python
// source is the spec), so cross-checking every existing regression test here is the primary
// correctness proof for the port, not just a formality.
import { describe, expect, it } from "vitest";

import { isGreeting, matchDateWindow, matchMetric, resolveDateRange, wantsCompare } from "../src/assistantIntents.js";
import { addDays, toISO, type PlainDate } from "../src/dateMath.js";

const iso = (d: PlainDate) => toISO(d);

describe("assistantIntents date matching", () => {
  it("day before yesterday", () => {
    const today: PlainDate = { y: 2026, m: 8, d: 31 };
    const [start, end, label] = matchDateWindow("what was my revenue the day before yesterday", today);
    expect([iso(start), iso(end)]).toEqual(["2026-08-29", "2026-08-29"]);
    expect(label).toBe("the day before yesterday");
  });

  it("day before yesterday does not resolve as plain yesterday", () => {
    const today: PlainDate = { y: 2026, m: 8, d: 31 };
    const [start] = matchDateWindow("day before yesterday", today);
    expect(iso(start)).not.toBe(iso(addDays(today, -1)));
  });

  it("today", () => {
    const today: PlainDate = { y: 2026, m: 8, d: 31 };
    const [start, end, label] = matchDateWindow("how much did i make today", today);
    expect([iso(start), iso(end)]).toEqual(["2026-08-31", "2026-08-31"]);
    expect(label).toBe("today");
  });

  it("yesterday", () => {
    const today: PlainDate = { y: 2026, m: 8, d: 31 };
    const [start, end, label] = matchDateWindow("what was my revenue yesterday", today);
    expect([iso(start), iso(end)]).toEqual(["2026-08-30", "2026-08-30"]);
    expect(label).toBe("yesterday");
  });

  it("last week maps to 7 days", () => {
    const today: PlainDate = { y: 2026, m: 8, d: 31 };
    const [start, end] = matchDateWindow("how did i do last week", today);
    expect([iso(start), iso(end)]).toEqual(["2026-08-24", "2026-08-31"]);
  });

  it("this quarter maps to 90 days", () => {
    const today: PlainDate = { y: 2026, m: 8, d: 31 };
    const [start, end] = matchDateWindow("revenue this quarter", today);
    expect([iso(start), iso(end)]).toEqual(["2026-06-02", "2026-08-31"]);
  });

  it("resolve_date_range: last_7_days matches dashboard convention", () => {
    const today: PlainDate = { y: 2026, m: 8, d: 31 };
    const [start, end] = resolveDateRange("last_7_days", today);
    expect([iso(start), iso(end)]).toEqual(["2026-08-24", "2026-08-31"]);
  });

  it("resolve_date_range: last_30_days matches dashboard convention", () => {
    const today: PlainDate = { y: 2026, m: 8, d: 31 };
    const [start, end] = resolveDateRange("last_30_days", today);
    expect([iso(start), iso(end)]).toEqual(["2026-08-01", "2026-08-31"]);
  });

  it("resolve_date_range: last_90_days matches dashboard convention", () => {
    const today: PlainDate = { y: 2026, m: 8, d: 31 };
    const [start, end] = resolveDateRange("last_90_days", today);
    expect([iso(start), iso(end)]).toEqual(["2026-06-02", "2026-08-31"]);
  });

  it("generic last N days matches dashboard convention", () => {
    const today: PlainDate = { y: 2026, m: 8, d: 31 };
    const [start, end, label] = matchDateWindow("what's my revenue for the last 60 days", today);
    expect([iso(start), iso(end)]).toEqual(["2026-07-02", "2026-08-31"]);
    expect(label).toBe("the last 60 days");
  });

  it("same_period_last_year shifts the 30-day window", () => {
    const today: PlainDate = { y: 2026, m: 8, d: 31 };
    const [start, end] = resolveDateRange("same_period_last_year", today);
    expect([iso(start), iso(end)]).toEqual(["2025-08-01", "2025-08-31"]);
  });

  it("named month with year", () => {
    const today: PlainDate = { y: 2026, m: 8, d: 31 };
    const [start, end, label] = matchDateWindow("gross revenue for july '26", today);
    expect([iso(start), iso(end)]).toEqual(["2026-07-01", "2026-07-31"]);
    expect(label).toBe("July 2026");
  });

  it("bare month name before it has happened means last year", () => {
    const today: PlainDate = { y: 2026, m: 3, d: 1 };
    const [start, , label] = matchDateWindow("revenue for december", today);
    expect(start.y).toBe(2025);
    expect(label).toBe("December 2025");
  });

  it("no recognized phrase falls back to default", () => {
    const today: PlainDate = { y: 2026, m: 8, d: 31 };
    const [start, end, label] = matchDateWindow("how's business going", today);
    expect([iso(start), iso(end)]).toEqual(["2026-08-01", "2026-08-31"]);
    expect(label).toBe("the last 30 days");
  });
});

describe("assistantIntents metric matching", () => {
  it("vague headline question defaults to net_revenue", () => {
    expect(matchMetric("how am i doing")).toBe("net_revenue");
    expect(matchMetric("how's business")).toBe("net_revenue");
    expect(matchMetric("give me an overview")).toBe("net_revenue");
  });

  it("new per-metric phrases don't collide with other metrics", () => {
    expect(matchMetric("how many sales did i have")).toBe("order_count");
    expect(matchMetric("what needs restocking")).toBe("inventory_by_product");
    expect(matchMetric("cost to acquire a customer")).toBe("blended_cpa");
    expect(matchMetric("what's my inventory worth")).toBe("total_inventory_value");
  });

  it("bare trend defaults to revenue_trend", () => {
    expect(matchMetric("show me trend")).toBe("revenue_trend");
  });

  it("bare trend loses to a more specific trend phrase", () => {
    expect(matchMetric("show me the ad spend trend")).toBe("ad_spend_trend");
    expect(matchMetric("discounts trend please")).toBe("discounts_refunds_trend");
  });

  it("longest phrase wins", () => {
    expect(matchMetric("what's my net revenue this month")).toBe("net_revenue");
    expect(matchMetric("what's my gross revenue this month")).toBe("gross_revenue");
  });

  it("no match returns null", () => {
    expect(matchMetric("how's the weather")).toBeNull();
  });

  it("greeting never preempts a real metric match", () => {
    expect(matchMetric("hi, what's my revenue today")).toBe("net_revenue");
  });
});

describe("assistantIntents compare/greeting matching", () => {
  it("detects new movement words", () => {
    expect(wantsCompare("is revenue growing or declining")).toBe(true);
    expect(wantsCompare("did ad spend drop")).toBe(false); // "dropped" is listed, not "drop"
    expect(wantsCompare("orders dropped this month")).toBe(true);
  });

  it("detects comparison language", () => {
    expect(wantsCompare("how does this compare to last month")).toBe(true);
    expect(wantsCompare("what's my revenue this month")).toBe(false);
  });

  it("matches common greetings", () => {
    expect(isGreeting("hi")).toBe(true);
    expect(isGreeting("Hello!")).toBe(true);
    expect(isGreeting("thanks!")).toBe(true);
    expect(isGreeting("what can you help with")).toBe(true);
  });

  it("word boundary does not false-match inside other words", () => {
    expect(isGreeting("which products sell best")).toBe(false);
    expect(isGreeting("what's my shipping cost")).toBe(false);
    expect(isGreeting("revenue this month")).toBe(false);
  });
});
