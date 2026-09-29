import { describe, expect, it } from "vitest";
import type { Metric, QueryResult } from "@apicem/api-contract";
import { buildLiftSeries, createQueryEngine } from "./fixtures";

const revenue: Metric = {
  id: "met_revenue",
  name: "Net Revenue",
  description: "Total revenue net of refunds.",
  category: "revenue",
  format: "currency",
  sourceIds: ["src_test"],
};
const cac: Metric = {
  id: "met_cac",
  name: "CAC",
  description: "Customer acquisition cost.",
  category: "marketing",
  format: "currency",
  sourceIds: ["src_test"],
};

const revenueByChannelPreset: QueryResult = {
  columns: [{ key: "channel", label: "Channel", type: "string" }],
  rows: [{ channel: "Email", value: 1 }],
  chartSuggestion: "bar",
  confidence: 0.9,
  summary: "Revenue split by channel.",
};

const revenueByCategoryPreset: QueryResult = {
  columns: [{ key: "category", label: "Category", type: "string" }],
  rows: [
    { category: "Outerwear", value: 1 },
    { category: "Footwear", value: 1 },
  ],
  chartSuggestion: "bar",
  confidence: 0.9,
  summary: "Revenue split by category.",
};

const revenueByRegionPreset: QueryResult = {
  columns: [{ key: "region", label: "Region", type: "string" }],
  rows: [
    { region: "West", value: 1 },
    { region: "East", value: 1 },
    { region: "Central", value: 1 },
  ],
  chartSuggestion: "bar",
  confidence: 0.9,
  summary: "Revenue split by region.",
};

/**
 * `createQueryEngine` is the actual "answer" logic behind Explore's Ask tab
 * and Build tab — the one thing standing between "the product resolves
 * questions to real answers" and "the product resolves questions to
 * whatever happened to match first." Every branch here is a real decision
 * a user's question or manual-build selection can hit.
 */
describe("createQueryEngine", () => {
  const engine = createQueryEngine(
    "wksp_test",
    [revenue, cac],
    { met_revenue: { start: 100, trend: 0.01, vol: 5, seed: 1 } },
    {
      channel_breakdown: revenueByChannelPreset,
      category_breakdown: revenueByCategoryPreset,
      region_breakdown: revenueByRegionPreset,
    },
    [{ id: "q1", question: "How has net revenue trended?", hint: "met_revenue" }],
    { channel: "channel_breakdown", category: "category_breakdown", region: "region_breakdown" },
  );

  it("isMetricId only recognizes ids this workspace's own metrics list contains", () => {
    expect(engine.isMetricId("met_revenue")).toBe(true);
    expect(engine.isMetricId("met_from_a_different_workspace")).toBe(false);
  });

  it("resolves a manual-build metric selection to that metric's series", () => {
    const result = engine.resolveQuery(undefined, ["met_revenue"]);
    expect(result.resolvedKey).toBe("met_revenue");
    expect(result.rows.length).toBe(12);
  });

  it("resolves a manual-build group-by dimension to its preset, ahead of any metric also selected", () => {
    // A dimension groupBy is checked before metricId — grouping is what the
    // user asked for, not the ungrouped metric series.
    const result = engine.resolveQuery(undefined, ["met_revenue"], ["channel"]);
    expect(result.resolvedKey).toBe("channel_breakdown");
    expect(result.summary).toBe("Revenue split by channel.");
  });

  it("resolves an exact starter-question match by its hint key", () => {
    const result = engine.resolveQuery("How has net revenue trended?", undefined);
    expect(result.resolvedKey).toBe("met_revenue");
  });

  it("is case-insensitive when matching a starter question", () => {
    const result = engine.resolveQuery("HOW HAS NET REVENUE TRENDED?", undefined);
    expect(result.resolvedKey).toBe("met_revenue");
  });

  it("falls back to a fuzzy match against known metric/preset keys for an unrecognized question", () => {
    // "cac" isn't a starter question, but it shares "cac" with met_cac's id.
    const result = engine.resolveQuery("what's our cac looking like", undefined);
    expect(result.resolvedKey).toBe("met_cac");
  });

  it("returns a low-confidence 'not enough data' result for a question matching nothing", () => {
    const result = engine.resolveQuery("what's the weather like on mars", undefined);
    expect(result.resolvedKey).toBeUndefined();
    expect(result.confidence).toBeLessThan(0.5);
    expect(result.chartSuggestion).toBe("table");
  });

  it("getResultByKey resolves a preset key and a metric id, and nothing else", () => {
    expect(engine.getResultByKey("channel_breakdown")?.summary).toBe("Revenue split by channel.");
    expect(engine.getResultByKey("met_cac")?.resolvedKey).toBe("met_cac");
    expect(engine.getResultByKey("not_a_real_key")).toBeUndefined();
  });

  it("combines two or more metrics into one shared-week-axis result", () => {
    const result = engine.resolveQuery(undefined, ["met_revenue", "met_cac"]);
    expect(result.resolvedKey).toBe("multi:met_revenue,met_cac");
    expect(result.columns.map((c) => c.key)).toEqual(["week", "met_revenue", "met_cac"]);
    expect(result.rows).toHaveLength(12);
    // getResultByKey can round-trip the same composite key back to the
    // identical result, the same way a saved report block or exploration
    // reopens one.
    expect(engine.getResultByKey(result.resolvedKey!)?.resolvedKey).toBe(result.resolvedKey);
  });

  it("breaks two or more metrics down by one dimension, one column per metric", () => {
    const result = engine.resolveQuery(undefined, ["met_revenue", "met_cac"], ["channel"]);
    expect(result.resolvedKey).toBe("bydim:met_revenue,met_cac:channel");
    expect(result.columns.map((c) => c.key)).toEqual(["channel", "met_revenue", "met_cac"]);
    expect(result.rows).toHaveLength(1);
  });

  it("cross-tabs one metric by two dimensions, one row per combination of both dimensions' values", () => {
    const result = engine.resolveQuery(undefined, ["met_revenue"], ["channel", "category"]);
    expect(result.resolvedKey).toBe("crosstab:met_revenue:channel,category");
    expect(result.columns.map((c) => c.key)).toEqual(["channel", "category", "met_revenue"]);
    // 1 channel value x 2 category values in this fixture's presets.
    expect(result.rows).toHaveLength(2);
  });

  it("falls back to a one-dimension breakdown when the second dimension has no preset data for this workspace", () => {
    const result = engine.resolveQuery(undefined, ["met_revenue"], ["channel", "not_a_real_dimension"]);
    expect(result.resolvedKey).toBe("bydim:met_revenue:channel");
  });

  it("cross-tabs every selected metric by two dimensions, not just the first one", () => {
    // ids.length >= 1 && dims.length >= 2 is checked first in resolveQuery,
    // so 2 dimensions still wins over the metric-by-dimension path even
    // with 2+ metrics selected — but every selected metric gets its own
    // column, none of them silently dropped.
    const result = engine.resolveQuery(undefined, ["met_revenue", "met_cac"], ["channel", "category"]);
    expect(result.resolvedKey).toBe("crosstab:met_revenue,met_cac:channel,category");
    expect(result.columns.map((c) => c.key)).toEqual(["channel", "category", "met_revenue", "met_cac"]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows.every((r) => typeof r.met_revenue === "number" && typeof r.met_cac === "number")).toBe(true);
  });

  it("still cross-tabs both dimensions when none was selected yet, rather than collapsing to just the first dimension", () => {
    // Picking 2 dimensions before ever touching Value shouldn't silently
    // drop the second one — it defaults to the workspace's first metric so
    // both dimensions still show up in the breakdown.
    const result = engine.resolveQuery(undefined, undefined, ["channel", "category"]);
    expect(result.resolvedKey).toBe("crosstab:met_revenue:channel,category");
    expect(result.columns.map((c) => c.key)).toEqual(["channel", "category", "met_revenue"]);
    expect(result.rows).toHaveLength(2);
  });

  it("cross-tabs three or more dimensions at once, with no cap on how many — one column per dimension plus one per metric", () => {
    const result = engine.resolveQuery(undefined, ["met_revenue"], ["channel", "category", "region"]);
    expect(result.resolvedKey).toBe("crosstab:met_revenue:channel,category,region");
    expect(result.columns.map((c) => c.key)).toEqual(["channel", "category", "region", "met_revenue"]);
    // 1 channel value x 2 category values x 3 region values in this fixture's presets.
    expect(result.rows).toHaveLength(6);
    expect(result.rows.every((r) => typeof r.met_revenue === "number")).toBe(true);
  });

  it("drops just the dimensions with no preset data out of a larger set, rather than falling back to a single dimension", () => {
    const result = engine.resolveQuery(undefined, ["met_revenue"], ["channel", "not_a_real_dimension", "category", "region"]);
    expect(result.resolvedKey).toBe("crosstab:met_revenue:channel,category,region");
    expect(result.rows).toHaveLength(6);
  });

  describe("pivotResult", () => {
    it("pivots one metric by rows and columns, one row per row-combo and one cell per column group", () => {
      const result = engine.pivotResult(["met_revenue"], ["category"], ["region"]);
      expect(result.rowDimensions.map((c) => c.key)).toEqual(["category"]);
      expect(result.rows).toHaveLength(2); // category has 2 values
      expect(result.columnGroups).toHaveLength(3); // region has 3 values
      expect(result.columnGroups.map((g) => g.label)).toEqual(["West", "East", "Central"]);
      for (const row of result.rows) {
        for (const group of result.columnGroups) {
          expect(typeof row.cells[`${group.key}::met_revenue`]).toBe("number");
        }
      }
      // Grand totals are keyed the same way as each row's own cells.
      expect(typeof result.totals["West::met_revenue"]).toBe("number");
    });

    it("flattens multiple Rows dimensions into one row per combination when Columns is empty", () => {
      const result = engine.pivotResult(["met_revenue"], ["category", "region"], []);
      expect(result.rows).toHaveLength(6); // 2 categories x 3 regions
      expect(result.columnGroups).toEqual([]);
      // With no column groups, cells are keyed by the bare metric id.
      expect(result.rows.every((r) => typeof r.cells.met_revenue === "number")).toBe(true);
      expect(result.rows[0].rowValues).toHaveLength(2);
    });

    it("keeps every selected metric as its own cell, not just the first", () => {
      const result = engine.pivotResult(["met_revenue", "met_cac"], ["category"], []);
      expect(result.metricIds).toEqual(["met_revenue", "met_cac"]);
      expect(result.rows.every((r) => typeof r.cells.met_revenue === "number" && typeof r.cells.met_cac === "number")).toBe(true);
      expect(result.metricFormats.met_revenue).toBe("currency");
    });

    it("drops a dimension this workspace has no data for instead of failing the whole pivot", () => {
      const result = engine.pivotResult(["met_revenue"], ["not_a_real_dimension", "category"], []);
      expect(result.rowDimensions.map((c) => c.key)).toEqual(["category"]);
      expect(result.rows).toHaveLength(2);
    });

    it("defaults to the workspace's first metric when none was selected, same as the cross-tab fallback", () => {
      const result = engine.pivotResult([], ["category"], []);
      expect(result.metricIds).toEqual(["met_revenue"]);
    });

    it("still produces a single grand-total row when both Rows and Columns are empty", () => {
      const result = engine.pivotResult(["met_revenue", "met_cac"], [], []);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].rowKey).toBe("All");
      expect(result.columnGroups).toEqual([]);
    });
  });
});

describe("pivotResult and crossTabResult have no row-count ceiling", () => {
  // A dimension with far more values than any real one in this app has —
  // proves neither function silently truncates once the combination gets
  // large, now that the cell-count safety cap has been removed entirely.
  // "small" stays tiny so crossTabResult x "big" is a bounded, fast-to-run
  // 12,000 rows rather than an actually enormous array.
  const manyValues = Array.from({ length: 6000 }, (_, i) => ({ big: `v${i}`, value: 1 }));
  const bigPreset: QueryResult = {
    columns: [{ key: "big", label: "Big", type: "string" }],
    rows: manyValues,
    chartSuggestion: "table",
    confidence: 0.9,
    summary: "A dimension with many values.",
  };
  const smallPreset: QueryResult = {
    columns: [{ key: "small", label: "Small", type: "string" }],
    rows: [
      { small: "A", value: 1 },
      { small: "B", value: 1 },
    ],
    chartSuggestion: "table",
    confidence: 0.9,
    summary: "A dimension with few values.",
  };
  const engine = createQueryEngine(
    "wksp_big",
    [revenue],
    { met_revenue: { start: 100, trend: 0, vol: 1, seed: 1 } },
    { big_breakdown: bigPreset, small_breakdown: smallPreset },
    [],
    { big: "big_breakdown", small: "small_breakdown" },
  );

  it("generates every row of a pivot's Rows dimension, no matter how many values it has", () => {
    const result = engine.pivotResult(["met_revenue"], ["big"], []);
    expect(result.rows).toHaveLength(6000);
  });

  it("generates every row of a cross-tab — well past the old 5000-cell cap — with none of them dropped", () => {
    const result = engine.resolveQuery(undefined, ["met_revenue"], ["big", "small"]);
    expect(result.rows).toHaveLength(12_000);
    expect(result.summary).not.toContain("truncated");
  });
});

/**
 * `buildLiftSeries` drives the treatment-vs-holdout chart on the experiment
 * detail page — it's demo-data generation, not a real statistical engine
 * (there's no backend yet to compute a real lift from), but the ramp-in
 * shape it produces is exactly what would silently break if refactored:
 * it's what makes the chart visually communicate "lift builds up," not a
 * step-function jump.
 */
describe("buildLiftSeries", () => {
  it("produces one point per week, in chronological order, for both series", () => {
    const { treatmentSeries, holdoutSeries } = buildLiftSeries(8, 20_000, 0.05, 1);
    expect(treatmentSeries).toHaveLength(8);
    expect(holdoutSeries).toHaveLength(8);
    const dates = treatmentSeries.map((p) => p.date);
    expect(dates).toEqual([...dates].sort());
  });

  it("produces treatment values equal to holdout when liftPct is zero", () => {
    const { treatmentSeries, holdoutSeries } = buildLiftSeries(6, 10_000, 0, 7);
    treatmentSeries.forEach((point, i) => {
      expect(point.value).toBeCloseTo(holdoutSeries[i].value, 5);
    });
  });

  it("ramps lift in over the first three weeks rather than applying it all at once", () => {
    const { treatmentSeries, holdoutSeries } = buildLiftSeries(6, 10_000, 0.3, 3);
    const liftAt = (i: number) => treatmentSeries[i].value / holdoutSeries[i].value - 1;
    // Week 1 should show roughly a third of the full lift; by week 3+ it
    // should have ramped all the way to the full 0.3.
    expect(liftAt(0)).toBeCloseTo(0.1, 1);
    expect(liftAt(2)).toBeCloseTo(0.3, 1);
    expect(liftAt(5)).toBeCloseTo(0.3, 1);
  });

  it("never produces a negative value, even with high volatility relative to the base", () => {
    const { treatmentSeries, holdoutSeries } = buildLiftSeries(12, 100, 0.1, 99);
    [...treatmentSeries, ...holdoutSeries].forEach((point) => {
      expect(point.value).toBeGreaterThanOrEqual(0);
    });
  });
});
