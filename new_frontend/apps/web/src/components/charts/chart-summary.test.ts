import { describe, expect, it } from "vitest";
import type { QueryColumn } from "@apicem/api-contract";
import { describeLiftSeries, describeQuerySeries } from "./chart-summary";

const columns: QueryColumn[] = [
  { key: "week", label: "Week", type: "date" },
  { key: "value", label: "Net Revenue", type: "currency" },
];

describe("describeQuerySeries", () => {
  it("names the metric, the point count, and the direction of change", () => {
    const rows = [
      { week: "2026-01-01", value: 100 },
      { week: "2026-01-08", value: 150 },
    ];
    const summary = describeQuerySeries(rows, columns);
    expect(summary).toContain("Net Revenue");
    expect(summary).toContain("2 points");
    expect(summary).toContain("trending up");
  });

  it("says trending down when the last value is lower than the first", () => {
    const rows = [
      { week: "2026-01-01", value: 200 },
      { week: "2026-01-08", value: 120 },
    ];
    expect(describeQuerySeries(rows, columns)).toContain("trending down");
  });

  it("handles no data without throwing", () => {
    expect(describeQuerySeries([], columns)).toContain("no data");
  });

  it("describes every numeric value column for a multi-metric result, not just the first", () => {
    const multiCols: QueryColumn[] = [
      { key: "week", label: "Week", type: "date" },
      { key: "met_revenue", label: "Net Revenue", type: "currency" },
      { key: "met_cac", label: "CAC", type: "currency" },
    ];
    const rows = [
      { week: "2026-01-01", met_revenue: 100, met_cac: 20 },
      { week: "2026-01-08", met_revenue: 150, met_cac: 18 },
    ];
    const summary = describeQuerySeries(rows, multiCols);
    expect(summary).toContain("Net Revenue");
    expect(summary).toContain("CAC");
  });

  it("skips a second dimension column (a cross-tab's own string column) rather than describing it as a series", () => {
    const crossTabCols: QueryColumn[] = [
      { key: "channel", label: "Channel", type: "string" },
      { key: "category", label: "Category", type: "string" },
      { key: "met_revenue", label: "Net Revenue", type: "currency" },
    ];
    const rows = [
      { channel: "Meta Ads", category: "Outerwear", met_revenue: 40 },
      { channel: "Meta Ads", category: "Footwear", met_revenue: 20 },
    ];
    const summary = describeQuerySeries(rows, crossTabCols);
    expect(summary).toContain("Net Revenue");
    expect(summary).not.toContain("Category");
  });
});

describe("describeLiftSeries", () => {
  it("describes both series' start and end values", () => {
    const treatment = [
      { date: "2026-01-01", value: 1000 },
      { date: "2026-01-08", value: 1200 },
    ];
    const holdout = [
      { date: "2026-01-01", value: 1000 },
      { date: "2026-01-08", value: 1050 },
    ];
    const summary = describeLiftSeries(treatment, holdout);
    expect(summary).toContain("2 weeks");
    expect(summary).toContain("Treatment");
    expect(summary).toContain("holdout");
  });

  it("handles no data without throwing", () => {
    expect(describeLiftSeries([], [])).toContain("no data");
  });
});
