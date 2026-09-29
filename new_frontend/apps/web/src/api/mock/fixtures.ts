import { subDays, subHours, subMinutes, subWeeks, formatISO } from "date-fns";
import type {
  ColumnType,
  DataSource,
  DatasetSchema,
  Experiment,
  Metric,
  PivotColumnGroup,
  PivotResult,
  PivotRow,
  QueryResult,
  Report,
  Role,
  SyncRun,
  User,
  Workbook,
  Workspace,
  WorkspaceSummary,
} from "@apicem/api-contract";

const now = new Date();
const iso = (d: Date) => formatISO(d);

/**
 * The signed-in identity — one login, potentially several workspaces (Slack/
 * Notion-style: an agency operator's own workspace, plus client workspaces
 * they've been invited into with a different role in each). `role` here is
 * a placeholder overwritten per-bundle below; nothing reads this literal
 * value directly — always go through a bundle's `members` or `myRole`.
 */
export const currentUser: User = {
  id: "usr_jordan",
  name: "Jordan Ellis",
  email: "jordan@apicemengine.com",
  role: "owner",
  avatarColor: "var(--accent)",
};

// ---------------------------------------------------------------------------
// Shared, workspace-agnostic helpers
// ---------------------------------------------------------------------------

function weeklySeries(startValue: number, weeks: number, trend: number, volatility: number, seed = 1) {
  const points: number[] = [];
  let value = startValue;
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < weeks; i++) {
    value = value * (1 + trend) + (rand() - 0.5) * volatility;
    points.push(Math.max(0, Math.round(value * 100) / 100));
  }
  return points;
}

export function buildLiftSeries(weeks: number, holdoutBase: number, liftPct: number, seed: number) {
  const holdout = weeklySeries(holdoutBase, weeks, 0.006, holdoutBase * 0.05, seed);
  const treatment = holdout.map((v, i) => {
    // Lift ramps in over the first couple of weeks rather than jumping instantly.
    const rampedLift = liftPct * Math.min(1, (i + 1) / 3);
    return Math.round(v * (1 + rampedLift) * 100) / 100;
  });
  const dates = holdout.map((_, i) => iso(subWeeks(now, weeks - i - 1)).slice(0, 10));
  return {
    treatmentSeries: dates.map((date, i) => ({ date, value: treatment[i] })),
    holdoutSeries: dates.map((date, i) => ({ date, value: holdout[i] })),
  };
}

export interface StarterQuestion {
  id: string;
  question: string;
  hint: string;
}

/**
 * A generic schema preview for a *new* connection during the connect-source
 * flow — shown before anything about the customer's actual workspace data
 * exists, so it's deliberately workspace-agnostic (what any first Shopify
 * connection tends to look like), never sourced from a specific bundle.
 */
const genericSchemaByType: Record<string, DatasetSchema["tables"]> = {
  snowflake: [
    { name: "fact_orders", rowCount: 842_110, columns: [{ name: "order_id", type: "string" }, { name: "order_date", type: "date" }, { name: "total_amount", type: "currency" }] },
    { name: "dim_customers", rowCount: 128_400, columns: [{ name: "customer_id", type: "string" }, { name: "signup_date", type: "date" }, { name: "region", type: "string" }] },
  ],
  bigquery: [
    { name: "events_intraday", rowCount: 2_104_552, columns: [{ name: "event_id", type: "string" }, { name: "event_name", type: "string" }, { name: "event_timestamp", type: "date" }] },
    { name: "users", rowCount: 88_204, columns: [{ name: "user_id", type: "string" }, { name: "first_seen", type: "date" }] },
  ],
  redshift: [
    { name: "sales_fact", rowCount: 512_004, columns: [{ name: "sale_id", type: "string" }, { name: "amount", type: "currency" }, { name: "sale_date", type: "date" }] },
  ],
  postgres: [
    { name: "public.orders", rowCount: 64_112, columns: [{ name: "id", type: "string" }, { name: "created_at", type: "date" }, { name: "total_cents", type: "number" }] },
    { name: "public.users", rowCount: 21_004, columns: [{ name: "id", type: "string" }, { name: "email", type: "string" }] },
  ],
  google_sheets: [
    { name: "Sheet1", rowCount: 1_240, columns: [{ name: "date", type: "date" }, { name: "campaign", type: "string" }, { name: "spend", type: "currency" }] },
  ],
  shopify: [
    { name: "orders", rowCount: 96_402, columns: [{ name: "order_id", type: "string" }, { name: "order_date", type: "date" }, { name: "total", type: "currency" }] },
    { name: "products", rowCount: 1_842, columns: [{ name: "product_id", type: "string" }, { name: "title", type: "string" }, { name: "price", type: "currency" }] },
  ],
  quickbooks: [
    { name: "invoices", rowCount: 18_204, columns: [{ name: "invoice_id", type: "string" }, { name: "amount_due", type: "currency" }, { name: "due_date", type: "date" }] },
    { name: "expenses", rowCount: 9_552, columns: [{ name: "expense_id", type: "string" }, { name: "category", type: "string" }, { name: "amount", type: "currency" }] },
  ],
  stripe: [
    { name: "charges", rowCount: 101_884, columns: [{ name: "charge_id", type: "string" }, { name: "amount", type: "currency" }, { name: "status", type: "string" }] },
    { name: "refunds", rowCount: 4_012, columns: [{ name: "refund_id", type: "string" }, { name: "charge_id", type: "string" }, { name: "amount", type: "currency" }] },
  ],
  square: [
    { name: "payments", rowCount: 9_204, columns: [{ name: "payment_id", type: "string" }, { name: "amount", type: "currency" }, { name: "created_at", type: "date" }] },
    { name: "items", rowCount: 340, columns: [{ name: "item_id", type: "string" }, { name: "name", type: "string" }, { name: "price", type: "currency" }] },
  ],
};

export function getSchemaPreviewForType(type: string): DatasetSchema["tables"] {
  return genericSchemaByType[type] ?? [];
}

/** Builds the closures that answer `runQuery`/`getBlockData` for one workspace — never shared across bundles, so a workspace's questions can only ever resolve against its own metrics and presets. Exported so the adapter can build a fresh, empty engine for a newly created workspace, the same way every seed workspace's engine is built. */
export function createQueryEngine(
  workspaceId: string,
  metrics: Metric[],
  metricSeriesConfigs: Record<string, { start: number; trend: number; vol: number; seed: number }>,
  extraPresets: Record<string, QueryResult>,
  starterQuestions: StarterQuestion[],
  dimensionPresetKeys: Record<string, string>,
) {
  function isMetricId(key: string): boolean {
    return metrics.some((m) => m.id === key);
  }

  function buildMetricSeries(metricId: string, weeks = 12) {
    const cfg = metricSeriesConfigs[metricId] ?? { start: 100, trend: 0, vol: 5, seed: 1 };
    const values = weeklySeries(cfg.start, weeks, cfg.trend, cfg.vol, cfg.seed);
    return values.map((value, i) => ({ week: iso(subWeeks(now, weeks - i - 1)).slice(0, 10), value }));
  }

  function metricResult(metricId: string): QueryResult {
    const metric = metrics.find((m) => m.id === metricId)!;
    const series = buildMetricSeries(metricId, 12);
    return {
      columns: [
        { key: "week", label: "Week", type: "date" },
        { key: "value", label: metric.name, type: metric.format === "currency" ? "currency" : "number" },
      ],
      rows: series,
      chartSuggestion: "line",
      confidence: 0.94,
      sql: `select date_trunc('week', occurred_at) as week, ${metricId}(...) as value\nfrom metrics.${metricId}\nwhere workspace_id = '${workspaceId}'\ngroup by 1\norder by 1`,
      summary: `${metric.name} over the last 12 weeks, computed from ${metric.sourceIds.length} connected source${metric.sourceIds.length > 1 ? "s" : ""}.`,
      resolvedKey: metricId,
    };
  }

  const presetResults: Record<string, QueryResult> = {};
  for (const [key, result] of Object.entries(extraPresets)) {
    presetResults[key] = { ...result, resolvedKey: key };
  }

  /** The label column of a workspace's own single-dimension preset for `dim` (e.g. every channel name `cac_channel` already has a row for) — the source of truth for what values a cross-tab or multi-metric-by-dimension result iterates over, rather than a second, separately maintained list. Undefined for a dimension this workspace has no preset for at all (Aurora has no "category"/"product", say). */
  function dimensionValues(dim: string): string[] | undefined {
    const presetKey = dimensionPresetKeys[dim];
    const preset = presetKey ? presetResults[presetKey] : undefined;
    if (!preset || preset.rows.length === 0) return undefined;
    const labelKey = preset.columns[0].key;
    return preset.rows.map((r) => String(r[labelKey]));
  }

  /** A stable, deterministic multiplier in ~[0.55, 1.45] for one (metric, dimension, value) combination — the same inputs always produce the same weight, so a synthesized cross-tab or multi-metric-by-dimension cell doesn't reshuffle every time it's recomputed. */
  function seededWeight(...parts: string[]): number {
    let s = 7;
    for (const ch of parts.join("|")) s = (s * 31 + ch.charCodeAt(0)) % 100_000;
    return 0.55 + (s / 100_000) * 0.9;
  }

  function metricColumn(metricId: string) {
    const metric = metrics.find((m) => m.id === metricId)!;
    return { key: metricId, label: metric.name, type: (metric.format === "currency" ? "currency" : "number") as ColumnType };
  }

  function metricNames(metricIds: string[]): string {
    return metricIds.map((id) => metrics.find((m) => m.id === id)!.name).join(", ");
  }

  /** Two or more metrics, no dimension — one row per week, one column per metric, sharing the same 12-week axis each metric's own single-metric series already uses. */
  function multiMetricResult(metricIds: string[]): QueryResult | undefined {
    const ids = metricIds.filter(isMetricId);
    if (ids.length < 2) return undefined;
    const seriesPerMetric = ids.map((id) => buildMetricSeries(id, 12));
    const rows = seriesPerMetric[0].map((point, i) => {
      const row: Record<string, string | number> = { week: point.week };
      ids.forEach((id, mi) => {
        row[id] = seriesPerMetric[mi][i].value;
      });
      return row;
    });
    return {
      columns: [{ key: "week", label: "Week", type: "date" }, ...ids.map(metricColumn)],
      rows,
      chartSuggestion: "line",
      confidence: 0.9,
      summary: `${metricNames(ids)} over the last 12 weeks.`,
      resolvedKey: `multi:${ids.join(",")}`,
    };
  }

  /** One or more metrics broken down by one dimension — one row per dimension value, one column per metric. Used both for "two or more metrics, one dimension" and (via crossTabResult falling back to it) "one metric, two dimensions where the workspace can't cross them". */
  function metricByDimensionResult(metricIds: string[], dim: string): QueryResult | undefined {
    const ids = metricIds.filter(isMetricId);
    const values = dimensionValues(dim);
    if (ids.length === 0 || !values) return undefined;
    const label = dim.charAt(0).toUpperCase() + dim.slice(1);
    const rows = values.map((v) => {
      const row: Record<string, string | number> = { [dim]: v };
      for (const id of ids) {
        const cfg = metricSeriesConfigs[id] ?? { start: 100, trend: 0, vol: 5, seed: 1 };
        const base = cfg.start / values.length;
        row[id] = Math.round(base * seededWeight(id, dim, v) * 100) / 100;
      }
      return row;
    });
    return {
      columns: [{ key: dim, label, type: "string" }, ...ids.map(metricColumn)],
      rows,
      chartSuggestion: "table",
      confidence: 0.85,
      summary: `${metricNames(ids)} broken down by ${label}.`,
      resolvedKey: `bydim:${ids.join(",")}:${dim}`,
    };
  }

  /** Every dimension in `dims` this workspace actually has preset data for — silently drops the rest rather than failing the whole cross-tab/pivot over one bad dimension, an "always show something real" precedent that predates both callers below. */
  function usableDims(dims: string[]): string[] {
    return dims.filter((d) => (dimensionValues(d) ?? []).length > 0);
  }

  /** Every combination of values across `dims`, each value tagged with the dimension it came from (needed so comboWeight can seed on the right (metric, dimension, value) triples). `[[]]` — one empty combination — for zero dimensions, so a pivot with nothing on a shelf still has exactly one "combo" to iterate. */
  function combosFor(dims: string[]): Array<{ dim: string; value: string }[]> {
    if (dims.length === 0) return [[]];
    const lists = dims.map((d) => dimensionValues(d)!.map((value) => ({ dim: d, value })));
    return lists.reduce<Array<{ dim: string; value: string }[]>>(
      (acc, list) => acc.flatMap((combo) => list.map((item) => [...combo, item])),
      [[]],
    );
  }

  function comboWeight(id: string, combo: Array<{ dim: string; value: string }>): number {
    return combo.reduce((w, { dim, value }) => w * seededWeight(id, dim, value), 1);
  }

  /**
   * One or more metrics, two or more dimensions — every combination of
   * every given dimension's own values, one column per dimension plus one
   * per metric. No cap on how many dimensions: this is the same cartesian-
   * combination approach pivotResult uses for its Rows shelf, just
   * flattened into a single QueryResult instead of a collapsible tree.
   * Drops any dimension the workspace has no preset data for rather than
   * failing outright, falling back to metricByDimensionResult if only one
   * usable dimension is left.
   */
  function crossTabResult(metricIds: string[], dims: string[]): QueryResult | undefined {
    const ids = metricIds.filter(isMetricId);
    if (ids.length === 0 || dims.length < 2) return undefined;
    const usedDims = usableDims(dims);
    if (usedDims.length < 2) return usedDims.length === 1 ? metricByDimensionResult(ids, usedDims[0]) : undefined;

    const combos = combosFor(usedDims);
    const labels = usedDims.map((d) => d.charAt(0).toUpperCase() + d.slice(1));

    const rows = combos.map((combo) => {
      const row: Record<string, string | number> = {};
      for (const { dim, value } of combo) row[dim] = value;
      for (const id of ids) {
        const cfg = metricSeriesConfigs[id] ?? { start: 100, trend: 0, vol: 5, seed: 1 };
        const base = cfg.start / combos.length;
        row[id] = Math.round(base * comboWeight(id, combo) * 100) / 100;
      }
      return row;
    });

    return {
      columns: [...usedDims.map((dim, i) => ({ key: dim, label: labels[i], type: "string" as ColumnType })), ...ids.map(metricColumn)],
      rows,
      chartSuggestion: "table",
      confidence: 0.82,
      summary: `${metricNames(ids)} broken down by ${labels.join(", ")}.`,
      resolvedKey: `crosstab:${ids.join(",")}:${usedDims.join(",")}`,
    };
  }

  /**
   * A real pivot table: any number of dimensions on Rows, any number on
   * Columns, any number of metrics — genuinely independent shelves, unlike
   * runQuery's single `dimensions` list. Every unique combination of
   * Rows-shelf values becomes one row (flattened, not a collapsible nested
   * tree); every unique combination of Columns-shelf values becomes one
   * column group, with every metric as its own column inside each group
   * (or, with no Columns dimensions, one column per metric). Falls back to
   * the workspace's first metric when none was selected, same as
   * crossTabResult's own no-metric fallback.
   */
  function pivotResult(metricIds: string[], rowDims: string[], colDims: string[]): PivotResult {
    const ids = metricIds.filter(isMetricId).length > 0 ? metricIds.filter(isMetricId) : metrics.slice(0, 1).map((m) => m.id);
    const usedRowDims = usableDims(rowDims);
    const usedColDims = usableDims(colDims);

    const rowCombos = combosFor(usedRowDims);
    const colCombos = combosFor(usedColDims);

    const columnGroups: PivotColumnGroup[] = usedColDims.length === 0
      ? []
      : colCombos.map((combo) => {
          const values = combo.map((c) => c.value);
          return { key: values.join("::"), label: values.join(" / "), values };
        });

    const rows: PivotRow[] = rowCombos.map((rowCombo) => {
      const cells: Record<string, number> = {};
      for (const colCombo of colCombos) {
        const colKey = usedColDims.length === 0 ? undefined : colCombo.map((c) => c.value).join("::");
        for (const id of ids) {
          const cfg = metricSeriesConfigs[id] ?? { start: 100, trend: 0, vol: 5, seed: 1 };
          const base = cfg.start / (rowCombos.length * colCombos.length);
          const value = Math.round(base * comboWeight(id, [...rowCombo, ...colCombo]) * 100) / 100;
          cells[colKey ? `${colKey}::${id}` : id] = value;
        }
      }
      return { rowKey: rowCombo.map((c) => c.value).join(" / ") || "All", rowValues: rowCombo.map((c) => c.value), cells };
    });

    const totals: Record<string, number> = {};
    for (const row of rows) {
      for (const [key, value] of Object.entries(row.cells)) {
        totals[key] = Math.round(((totals[key] ?? 0) + value) * 100) / 100;
      }
    }

    const metricLabels: Record<string, string> = {};
    const metricFormats: Record<string, Metric["format"]> = {};
    for (const id of ids) {
      const metric = metrics.find((m) => m.id === id);
      metricLabels[id] = metric?.name ?? id;
      metricFormats[id] = metric?.format ?? "number";
    }

    const pivotedBy = [...usedRowDims, ...usedColDims].map((d) => d.charAt(0).toUpperCase() + d.slice(1));
    const summary =
      pivotedBy.length === 0
        ? `${metricNames(ids)}, with no rows or columns to break it down by yet.`
        : `${metricNames(ids)} pivoted by ${pivotedBy.join(", ")}.`;

    return {
      rowDimensions: usedRowDims.map((d) => ({ key: d, label: d.charAt(0).toUpperCase() + d.slice(1), type: "string" as ColumnType })),
      columnGroups,
      metricIds: ids,
      metricLabels,
      metricFormats,
      rows,
      totals,
      confidence: pivotedBy.length === 0 ? 0.9 : 0.8,
      summary,
    };
  }

  function getResultByKey(key: string): QueryResult | undefined {
    if (key.startsWith("multi:")) return multiMetricResult(key.slice(6).split(","));
    if (key.startsWith("bydim:")) {
      const [idsPart, dim] = key.slice(6).split(":");
      return metricByDimensionResult(idsPart.split(","), dim);
    }
    if (key.startsWith("crosstab:")) {
      const [idsPart, dimsPart] = key.slice(9).split(":");
      return crossTabResult(idsPart.split(","), dimsPart.split(","));
    }
    if (presetResults[key]) return presetResults[key];
    if (isMetricId(key)) return metricResult(key);
    return undefined;
  }

  /**
   * How a request's metric count and dimension count combine:
   *  - 1 metric,  0 dims -> that metric's own 12-week series (unchanged, always has).
   *  - 1 metric,  1 dim  -> the workspace's single-dimension preset for it, same as always
   *                         (a dimension present here has always taken priority over a
   *                         metric also being present — preserved exactly, not "fixed").
   *  - 0+ metric,  2+ dims -> crossTabResult: a real breakdown across every dimension given,
   *                         one column per dimension plus one per metric selected — no cap on
   *                         either. Picking 2+ dimensions with no metric yet chosen still
   *                         cross-tabs — defaulting to the workspace's first metric — rather
   *                         than silently collapsing to a one-dimension breakdown that drops
   *                         every other dimension the user just added.
   *  - 2+ metrics, 0 dims -> multiMetricResult: several metrics, one shared week axis.
   *  - 2+ metrics, 1 dim  -> metricByDimensionResult: several metrics, one dimension's values.
   * Anything with fewer than two metrics AND fewer than two dimensions falls through to
   * the exact single-select logic this function has always had.
   */
  function resolveQuery(question: string | undefined, metricIds: string[] | undefined, dimensions?: string[]): QueryResult {
    const ids = (metricIds ?? []).filter(Boolean);
    const dims = (dimensions ?? []).filter(Boolean);

    if (ids.length >= 2 || dims.length >= 2) {
      if (dims.length >= 2) {
        const crossTabIds = ids.length > 0 ? ids : metrics.slice(0, 1).map((m) => m.id);
        const result = crossTabResult(crossTabIds, dims);
        if (result) return result;
      }
      if (ids.length >= 2 && dims.length >= 1) {
        const result = metricByDimensionResult(ids, dims[0]);
        if (result) return result;
      }
      if (ids.length >= 2) {
        const result = multiMetricResult(ids);
        if (result) return result;
      }
    }

    const groupBy = dims[0];
    if (groupBy && dimensionPresetKeys[groupBy]) {
      const grouped = getResultByKey(dimensionPresetKeys[groupBy]);
      if (grouped) return grouped;
    }
    if (ids[0] && isMetricId(ids[0])) return metricResult(ids[0]);
    if (question) {
      const normalized = question.toLowerCase();
      const hit = starterQuestions.find((q) => q.question.toLowerCase() === normalized);
      if (hit) {
        const result = getResultByKey(hit.hint);
        if (result) return result;
      }
      // Check every underscore-separated segment of the key, not just the
      // first: every metric id in a given workspace shares the same generic
      // prefix ("met_" here, "aur_" in Aurora's bundle), so matching on only
      // the first segment can never distinguish one metric from another —
      // it only ever finds that meaningless shared prefix, meaning a free-
      // typed question could never fuzzy-match a metric at all, only a
      // preset (whose keys don't share a common prefix).
      const knownKeys = [...Object.keys(presetResults), ...metrics.map((m) => m.id)];
      const fuzzy = knownKeys.find((key) => key.split("_").some((segment) => normalized.includes(segment)));
      if (fuzzy) {
        const result = getResultByKey(fuzzy);
        if (result) return result;
      }
    }
    return {
      columns: [{ key: "note", label: "Note", type: "string" }],
      rows: [{ note: "Not enough matching data to answer confidently." }],
      chartSuggestion: "table",
      confidence: 0.31,
      summary:
        "This doesn't match a metric or column Apicem Engine recognizes yet in this workspace. Try referencing a specific metric, or rephrase with a time range.",
    };
  }

  return { isMetricId, buildMetricSeries, metricResult, getResultByKey, resolveQuery, pivotResult };
}

export interface WorkspaceBundle {
  workspace: Workspace;
  myRole: Role;
  members: User[];
  dataSources: DataSource[];
  schemaBySource: Record<string, DatasetSchema>;
  metrics: Metric[];
  workbooks: Workbook[];
  reports: Report[];
  experiments: Experiment[];
  syncRunsBySource: Record<string, SyncRun[]>;
  starterQuestions: StarterQuestion[];
  dimensionPresetKeys: Record<string, string>;
  isMetricId: (key: string) => boolean;
  getResultByKey: (key: string) => QueryResult | undefined;
  resolveQuery: (question: string | undefined, metricIds: string[] | undefined, dimensions?: string[]) => QueryResult;
  pivotResult: (metricIds: string[], rowDimensions: string[], columnDimensions: string[]) => PivotResult;
}

// ---------------------------------------------------------------------------
// Workspace 1 — Northwind Outfitters (the rich, primary demo workspace)
// ---------------------------------------------------------------------------

const northwindWorkspace: Workspace = {
  id: "wksp_northwind",
  name: "Northwind Outfitters",
  slug: "northwind-outfitters",
  plan: "growth",
  memberCount: 6,
};

const northwindMembers: User[] = [
  { ...currentUser, role: "owner" },
  { id: "usr_priya", name: "Priya Nair", email: "priya@northwindoutfitters.com", role: "admin", avatarColor: "#3b5f8a" },
  { id: "usr_devon", name: "Devon Shaw", email: "devon@northwindoutfitters.com", role: "editor", avatarColor: "#7a8f6d" },
  { id: "usr_mei", name: "Mei Chen", email: "mei@northwindoutfitters.com", role: "editor", avatarColor: "#a15a3f" },
  { id: "usr_sam", name: "Sam Ibarra", email: "sam@northwindoutfitters.com", role: "viewer", avatarColor: "#6e6656" },
];

const northwindDataSources: DataSource[] = [
  { id: "src_shopify", workspaceId: northwindWorkspace.id, type: "shopify", name: "Shopify: Storefront", status: "connected", lastSyncedAt: iso(subMinutes(now, 12)), tableCount: 8, rowCount: 412_038 },
  { id: "src_stripe", workspaceId: northwindWorkspace.id, type: "stripe", name: "Stripe: Payments", status: "connected", lastSyncedAt: iso(subMinutes(now, 40)), tableCount: 6, rowCount: 388_210 },
  { id: "src_quickbooks", workspaceId: northwindWorkspace.id, type: "quickbooks", name: "QuickBooks Online", status: "connected", lastSyncedAt: iso(subHours(now, 3)), tableCount: 5, rowCount: 51_940 },
  { id: "src_sheets", workspaceId: northwindWorkspace.id, type: "google_sheets", name: "Marketing Spend Tracker", status: "syncing", lastSyncedAt: iso(subDays(now, 1)), tableCount: 1, rowCount: 2_184 },
  {
    id: "src_supabase",
    workspaceId: northwindWorkspace.id,
    type: "postgres",
    name: "Product Events DB",
    status: "error",
    lastSyncedAt: iso(subDays(now, 4)),
    tableCount: 3,
    rowCount: 1_204_552,
    errorMessage: "Credentials expired. The read-only role's password was rotated on the source database.",
  },
  { id: "src_square", workspaceId: northwindWorkspace.id, type: "square", name: "Square: Pop-up Retail", status: "pending", lastSyncedAt: null, tableCount: 0, rowCount: 0 },
];

const northwindSchemaBySource: Record<string, DatasetSchema> = {
  src_shopify: {
    sourceId: "src_shopify",
    tables: [
      { name: "orders", rowCount: 96_402, columns: [
        { name: "order_id", type: "string", sample: "NW-108452" },
        { name: "order_date", type: "date", sample: "2026-08-14" },
        { name: "customer_id", type: "string", sample: "cus_88214" },
        { name: "channel", type: "string", sample: "online store" },
        { name: "subtotal", type: "currency", sample: "128.00" },
        { name: "discount", type: "currency", sample: "12.80" },
        { name: "total", type: "currency", sample: "115.20" },
      ] },
      { name: "line_items", rowCount: 214_009, columns: [
        { name: "line_item_id", type: "string" },
        { name: "order_id", type: "string" },
        { name: "product_id", type: "string" },
        { name: "quantity", type: "number" },
        { name: "unit_price", type: "currency" },
      ] },
      { name: "products", rowCount: 1_842, columns: [
        { name: "product_id", type: "string" },
        { name: "title", type: "string", sample: "Trailhead Ridge Jacket" },
        { name: "category", type: "string", sample: "Outerwear" },
        { name: "cost", type: "currency" },
        { name: "price", type: "currency" },
      ] },
    ],
  },
  src_stripe: {
    sourceId: "src_stripe",
    tables: [
      { name: "charges", rowCount: 101_884, columns: [
        { name: "charge_id", type: "string" },
        { name: "customer_id", type: "string" },
        { name: "amount", type: "currency" },
        { name: "fee", type: "currency" },
        { name: "status", type: "string", sample: "succeeded" },
        { name: "created_at", type: "date" },
      ] },
      { name: "refunds", rowCount: 4_012, columns: [
        { name: "refund_id", type: "string" },
        { name: "charge_id", type: "string" },
        { name: "amount", type: "currency" },
        { name: "reason", type: "string" },
      ] },
    ],
  },
  src_quickbooks: {
    sourceId: "src_quickbooks",
    tables: [
      { name: "invoices", rowCount: 18_204, columns: [
        { name: "invoice_id", type: "string" },
        { name: "customer_id", type: "string" },
        { name: "amount_due", type: "currency" },
        { name: "due_date", type: "date" },
        { name: "status", type: "string" },
      ] },
      { name: "expenses", rowCount: 9_552, columns: [
        { name: "expense_id", type: "string" },
        { name: "category", type: "string", sample: "Fulfillment" },
        { name: "amount", type: "currency" },
        { name: "expense_date", type: "date" },
      ] },
    ],
  },
  src_sheets: {
    sourceId: "src_sheets",
    tables: [
      { name: "ad_spend", rowCount: 2_184, columns: [
        { name: "week_start", type: "date" },
        { name: "platform", type: "string", sample: "Meta" },
        { name: "campaign", type: "string" },
        { name: "spend", type: "currency" },
        { name: "clicks", type: "number" },
      ] },
    ],
  },
  src_supabase: {
    sourceId: "src_supabase",
    tables: [
      { name: "product_events", rowCount: 1_204_552, columns: [
        { name: "event_id", type: "string" },
        { name: "session_id", type: "string" },
        { name: "event_type", type: "string", sample: "add_to_cart" },
        { name: "occurred_at", type: "date" },
      ] },
      { name: "sessions", rowCount: 288_004, columns: [
        { name: "session_id", type: "string" },
        { name: "customer_id", type: "string" },
        { name: "device", type: "string" },
        { name: "started_at", type: "date" },
      ] },
    ],
  },
};

const northwindMetrics: Metric[] = [
  { id: "met_revenue", name: "Net Revenue", description: "Total order value after discounts and refunds.", category: "revenue", format: "currency", sourceIds: ["src_shopify", "src_stripe"] },
  { id: "met_margin", name: "Gross Margin", description: "Revenue minus cost of goods sold, as a percentage of revenue.", category: "revenue", format: "percent", sourceIds: ["src_shopify", "src_quickbooks"] },
  { id: "met_cac", name: "Customer Acquisition Cost", description: "Ad spend divided by new customers acquired in the same period.", category: "marketing", format: "currency", sourceIds: ["src_sheets", "src_shopify"] },
  { id: "met_ltv", name: "Customer Lifetime Value", description: "Projected revenue per customer over a 24-month horizon.", category: "growth", format: "currency", sourceIds: ["src_shopify", "src_stripe"] },
  { id: "met_roas", name: "Return on Ad Spend", description: "Attributed revenue divided by ad spend.", category: "marketing", format: "number", sourceIds: ["src_sheets", "src_shopify"] },
  { id: "met_repeat_rate", name: "Repeat Purchase Rate", description: "Share of customers with more than one order in the period.", category: "engagement", format: "percent", sourceIds: ["src_shopify"] },
  { id: "met_aov", name: "Average Order Value", description: "Net revenue divided by order count.", category: "revenue", format: "currency", sourceIds: ["src_shopify"] },
  { id: "met_active_customers", name: "Active Customers", description: "Distinct customers with at least one order in the period.", category: "engagement", format: "number", sourceIds: ["src_shopify"] },
];

// Explorations only — a report is never stored here. It's derived on read
// (see listWorkbooks/getWorkbook in mock/adapter.ts) from northwindReports
// instead, so a report created, renamed, or deleted at runtime shows up
// correctly on Home without this array needing to be kept in sync with it.
const northwindWorkbooks: Workbook[] = [
  { id: "wb_revenue_overview", name: "Revenue Overview", kind: "workbook", ownerId: currentUser.id, updatedAt: iso(subHours(now, 2)), views: 214, folder: "Finance", query: { source: "metric", key: "met_revenue" } },
  { id: "wb_marketing_perf", name: "Marketing Performance", kind: "workbook", ownerId: "usr_priya", updatedAt: iso(subDays(now, 1)), views: 156, folder: "Marketing", query: { source: "preset", key: "cac_channel" } },
  { id: "wb_cohort_retention", name: "Cohort Retention", kind: "workbook", ownerId: "usr_mei", updatedAt: iso(subDays(now, 3)), views: 88, folder: "Growth", query: { source: "metric", key: "met_repeat_rate" } },
  { id: "wb_inventory_health", name: "Inventory Health", kind: "workbook", ownerId: "usr_devon", updatedAt: iso(subWeeks(now, 1)), views: 61, query: { source: "preset", key: "top_products" } },
];

const northwindStarterQuestions: StarterQuestion[] = [
  { id: "q_revenue_trend", question: "How has net revenue trended over the last 12 weeks?", hint: "met_revenue" },
  { id: "q_cac_by_channel", question: "What's our customer acquisition cost by channel this month?", hint: "cac_channel" },
  { id: "q_repeat_customers", question: "What share of customers made a repeat purchase last quarter?", hint: "met_repeat_rate" },
  { id: "q_top_products", question: "Which products drove the most revenue in the last 30 days?", hint: "top_products" },
  { id: "q_margin_by_category", question: "How does gross margin vary by product category?", hint: "margin_category" },
];

const northwindPresets: Record<string, QueryResult> = {
  cac_channel: {
    columns: [
      { key: "channel", label: "Channel", type: "string" },
      { key: "cac", label: "CAC", type: "currency" },
      { key: "customers", label: "New Customers", type: "number" },
    ],
    rows: [
      { channel: "Meta Ads", cac: 31.2, customers: 812 },
      { channel: "Google Ads", cac: 27.8, customers: 604 },
      { channel: "Organic Search", cac: 4.1, customers: 918 },
      { channel: "Email", cac: 2.4, customers: 340 },
      { channel: "Affiliates", cac: 19.6, customers: 221 },
    ],
    chartSuggestion: "bar",
    confidence: 0.89,
    sql: "select channel, sum(spend) / nullif(count(distinct new_customer_id), 0) as cac, count(distinct new_customer_id) as customers\nfrom marketing.ad_spend a join growth.new_customers c using (channel)\ngroup by 1 order by 2 desc",
    summary: "CAC blends Marketing Spend Tracker ad spend against new customers attributed in Shopify this month.",
  },
  top_products: {
    columns: [
      { key: "product", label: "Product", type: "string" },
      { key: "revenue", label: "Revenue (30d)", type: "currency" },
      { key: "units", label: "Units Sold", type: "number" },
    ],
    rows: [
      { product: "Trailhead Ridge Jacket", revenue: 48_210, units: 612 },
      { product: "Summit Fleece Pullover", revenue: 36_940, units: 890 },
      { product: "All-Weather Field Pants", revenue: 29_115, units: 540 },
      { product: "Basecamp Wool Beanie", revenue: 14_802, units: 1_240 },
      { product: "Traverse Trail Runners", revenue: 41_330, units: 388 },
    ],
    chartSuggestion: "table",
    confidence: 0.97,
    sql: "select p.title as product, sum(li.quantity * li.unit_price) as revenue, sum(li.quantity) as units\nfrom shopify.line_items li join shopify.products p using (product_id)\nwhere li.order_date >= current_date - interval '30 days'\ngroup by 1 order by 2 desc limit 5",
    summary: "Top five products by revenue over the trailing 30 days, from Shopify order line items.",
  },
  margin_category: {
    columns: [
      { key: "category", label: "Category", type: "string" },
      { key: "margin", label: "Gross Margin", type: "number" },
    ],
    rows: [
      { category: "Outerwear", margin: 61.2 },
      { category: "Footwear", margin: 52.8 },
      { category: "Accessories", margin: 68.4 },
      { category: "Base Layers", margin: 57.1 },
    ],
    chartSuggestion: "bar",
    confidence: 0.91,
    sql: "select category, avg((price - cost) / nullif(price,0)) * 100 as margin\nfrom shopify.products group by 1 order by 2 desc",
    summary: "Average gross margin by product category across the current catalog.",
  },
};

const northwindQueryEngine = createQueryEngine(
  northwindWorkspace.id,
  northwindMetrics,
  {
    met_revenue: { start: 68_000, trend: 0.018, vol: 6000, seed: 7 },
    met_margin: { start: 58, trend: 0.002, vol: 1.4, seed: 3 },
    met_cac: { start: 34, trend: -0.004, vol: 2.5, seed: 11 },
    met_ltv: { start: 210, trend: 0.006, vol: 8, seed: 5 },
    met_roas: { start: 3.4, trend: 0.003, vol: 0.3, seed: 9 },
    met_repeat_rate: { start: 28, trend: 0.004, vol: 1.1, seed: 13 },
    met_aov: { start: 84, trend: 0.002, vol: 3.5, seed: 17 },
    met_active_customers: { start: 4200, trend: 0.012, vol: 220, seed: 19 },
  },
  northwindPresets,
  northwindStarterQuestions,
  { channel: "cac_channel", category: "margin_category", product: "top_products" },
);

const northwindReportBlocksSeed = [
  { id: "blk_kpi_revenue", type: "kpi" as const, layout: { x: 0, y: 0, w: 3, h: 4 }, config: { metricId: "met_revenue", label: "Net Revenue", delta: 8.2 } },
  { id: "blk_kpi_margin", type: "kpi" as const, layout: { x: 3, y: 0, w: 3, h: 4 }, config: { metricId: "met_margin", label: "Gross Margin", delta: 1.1 } },
  { id: "blk_kpi_cac", type: "kpi" as const, layout: { x: 6, y: 0, w: 3, h: 4 }, config: { metricId: "met_cac", label: "CAC", delta: -4.6 } },
  { id: "blk_kpi_ltv", type: "kpi" as const, layout: { x: 9, y: 0, w: 3, h: 4 }, config: { metricId: "met_ltv", label: "LTV", delta: 3.9 } },
  { id: "blk_chart_revenue", type: "chart" as const, layout: { x: 0, y: 4, w: 8, h: 9 }, config: { metricId: "met_revenue", chartType: "line", title: "Net Revenue (last 12 weeks)" } },
  {
    id: "blk_text_summary",
    type: "text" as const,
    layout: { x: 8, y: 4, w: 4, h: 9 },
    config: { title: "Notes", body: "Revenue is up 8.2% week over week, driven by the Trailhead Ridge Jacket restock. CAC continues to trend down as organic and email share grows." },
  },
  { id: "blk_table_products", type: "table" as const, layout: { x: 0, y: 13, w: 12, h: 8 }, config: { presetKey: "top_products", title: "Top products (30d)" } },
];

const northwindReports: Report[] = [
  {
    id: "rpt_board_deck",
    workspaceId: northwindWorkspace.id,
    name: "Board Deck (Q3)",
    description: "Pixel-perfect summary for the quarterly board update.",
    blocks: northwindReportBlocksSeed,
    ownerId: currentUser.id,
    updatedAt: iso(subHours(now, 5)),
    views: 42,
    folder: "Finance",
  },
  {
    id: "rpt_weekly_ops",
    workspaceId: northwindWorkspace.id,
    name: "Weekly Ops Snapshot",
    description: "Fulfillment and inventory health, refreshed every Monday.",
    blocks: [
      { id: "blk_kpi_active", type: "kpi", layout: { x: 0, y: 0, w: 4, h: 4 }, config: { metricId: "met_active_customers", label: "Active Customers", delta: 5.4 } },
      { id: "blk_kpi_aov", type: "kpi", layout: { x: 4, y: 0, w: 4, h: 4 }, config: { metricId: "met_aov", label: "AOV", delta: 1.8 } },
      { id: "blk_kpi_repeat", type: "kpi", layout: { x: 8, y: 0, w: 4, h: 4 }, config: { metricId: "met_repeat_rate", label: "Repeat Rate", delta: 0.6 } },
    ],
    ownerId: "usr_devon",
    updatedAt: iso(subDays(now, 0)),
    views: 301,
    folder: "Operations",
  },
];

const northwindMetaGeoLift = buildLiftSeries(8, 21_000, 0.084, 31);
const northwindEmailSegmentLift = buildLiftSeries(5, 8_400, 0.041, 41);

const northwindExperiments: Experiment[] = [
  {
    id: "exp_meta_geo_holdout",
    workspaceId: northwindWorkspace.id,
    name: "Meta Ads Geo Holdout (West Region)",
    hypothesis: "Raising Meta spend 30% in test geos drives incremental revenue beyond what organic and seasonal trends alone explain.",
    metricId: "met_revenue",
    unitType: "geo",
    treatment: { units: ["California", "Oregon", "Washington"], share: 0.31 },
    holdout: { units: ["Nevada", "Arizona", "Utah"], share: 0.18 },
    startDate: iso(subWeeks(now, 8)).slice(0, 10),
    endDate: iso(subWeeks(now, 0)).slice(0, 10),
    status: "completed",
    ownerId: "usr_priya",
    createdAt: iso(subWeeks(now, 9)),
    result: { liftPct: 0.084, incrementalValue: 46_280, confidenceInterval: [0.031, 0.137], significance: 0.92, iroas: 2.14, ...northwindMetaGeoLift },
  },
  {
    id: "exp_email_frequency",
    workspaceId: northwindWorkspace.id,
    name: "Email Send Frequency (VIP Segment)",
    hypothesis: "Sending VIP customers a third weekly campaign increases repeat purchase revenue without a matching rise in unsubscribes.",
    metricId: "met_revenue",
    unitType: "customer_segment",
    treatment: { units: ["VIP customers, 3x weekly"], share: 0.5 },
    holdout: { units: ["VIP customers, 2x weekly (control)"], share: 0.5 },
    startDate: iso(subWeeks(now, 5)).slice(0, 10),
    endDate: iso(subWeeks(now, 0)).slice(0, 10),
    status: "running",
    ownerId: "usr_priya",
    createdAt: iso(subWeeks(now, 5)),
    result: { liftPct: 0.041, incrementalValue: 3_640, confidenceInterval: [-0.012, 0.094], significance: 0.61, ...northwindEmailSegmentLift },
  },
  {
    id: "exp_google_pause",
    workspaceId: northwindWorkspace.id,
    name: "Google Ads Pause Test (Brand Terms)",
    hypothesis: "Branded search spend is largely incremental-neutral; pausing it in test geos won't reduce revenue.",
    metricId: "met_revenue",
    unitType: "geo",
    treatment: { units: ["Texas", "Colorado"], share: 0.22 },
    holdout: { units: ["Georgia", "North Carolina"], share: 0.19 },
    startDate: iso(subDays(now, -3)).slice(0, 10),
    endDate: iso(subWeeks(now, -6)).slice(0, 10),
    status: "draft",
    ownerId: currentUser.id,
    createdAt: iso(subDays(now, 1)),
  },
];

const northwindSyncRuns: Record<string, SyncRun[]> = {
  src_shopify: [
    { id: "run_shop_3", sourceId: "src_shopify", idempotencyKey: "sync_shopify_2026w36", attempt: 1, status: "success", startedAt: iso(subMinutes(now, 14)), finishedAt: iso(subMinutes(now, 12)), rowsUpserted: 412_038 },
    { id: "run_shop_2", sourceId: "src_shopify", idempotencyKey: "sync_shopify_2026w35", attempt: 1, status: "success", startedAt: iso(subDays(now, 1)), finishedAt: iso(subDays(now, 1)), rowsUpserted: 409_662 },
    { id: "run_shop_1", sourceId: "src_shopify", idempotencyKey: "sync_shopify_2026w34", attempt: 1, status: "success", startedAt: iso(subDays(now, 2)), finishedAt: iso(subDays(now, 2)), rowsUpserted: 406_951 },
  ],
  src_supabase: [
    {
      id: "run_supabase_1",
      sourceId: "src_supabase",
      idempotencyKey: "sync_supabase_2026w36",
      attempt: 1,
      status: "failed",
      startedAt: iso(subDays(now, 4)),
      finishedAt: iso(subDays(now, 4)),
      rowsUpserted: 812_004,
      errorMessage: "Credentials expired mid-sync. The read-only role's password was rotated on the source database.",
    },
  ],
};

const northwindBundle: WorkspaceBundle = {
  workspace: northwindWorkspace,
  myRole: "owner",
  members: northwindMembers,
  dataSources: northwindDataSources,
  schemaBySource: northwindSchemaBySource,
  metrics: northwindMetrics,
  workbooks: northwindWorkbooks,
  reports: northwindReports,
  experiments: northwindExperiments,
  syncRunsBySource: northwindSyncRuns,
  starterQuestions: northwindStarterQuestions,
  dimensionPresetKeys: { channel: "cac_channel", category: "margin_category", product: "top_products" },
  isMetricId: northwindQueryEngine.isMetricId,
  getResultByKey: northwindQueryEngine.getResultByKey,
  resolveQuery: northwindQueryEngine.resolveQuery,
  pivotResult: northwindQueryEngine.pivotResult,
};

// ---------------------------------------------------------------------------
// Workspace 2 — Aurora Fitness Co. (a smaller client workspace Jordan was
// invited into as an admin, not the owner — deliberately smaller than
// Northwind, and completely walled off from it: this is what proves tenant
// isolation is real rather than asserted, switch workspaces and watch every
// number change).
// ---------------------------------------------------------------------------

const auroraWorkspace: Workspace = {
  id: "wksp_aurora",
  name: "Aurora Fitness Co.",
  slug: "aurora-fitness",
  plan: "starter",
  memberCount: 3,
};

const auroraMembers: User[] = [
  { id: "usr_maya", name: "Maya Chen", email: "maya@aurorafitness.co", role: "owner", avatarColor: "#5f7a8f" },
  { ...currentUser, role: "admin" },
  { id: "usr_diego", name: "Diego Ramos", email: "diego@aurorafitness.co", role: "editor", avatarColor: "#8f6d5f" },
];

const auroraDataSources: DataSource[] = [
  { id: "src_aurora_shopify", workspaceId: auroraWorkspace.id, type: "shopify", name: "Shopify: Storefront", status: "connected", lastSyncedAt: iso(subMinutes(now, 25)), tableCount: 3, rowCount: 38_412 },
  { id: "src_aurora_stripe", workspaceId: auroraWorkspace.id, type: "stripe", name: "Stripe: Payments", status: "connected", lastSyncedAt: iso(subHours(now, 1)), tableCount: 2, rowCount: 35_006 },
];

const auroraSchemaBySource: Record<string, DatasetSchema> = {
  src_aurora_shopify: {
    sourceId: "src_aurora_shopify",
    tables: [
      { name: "orders", rowCount: 9_204, columns: [
        { name: "order_id", type: "string", sample: "AF-4021" },
        { name: "order_date", type: "date" },
        { name: "channel", type: "string", sample: "online store" },
        { name: "total", type: "currency" },
      ] },
      { name: "products", rowCount: 214, columns: [
        { name: "product_id", type: "string" },
        { name: "title", type: "string", sample: "Aurora Resistance Band Set" },
        { name: "cost", type: "currency" },
        { name: "price", type: "currency" },
      ] },
    ],
  },
  src_aurora_stripe: {
    sourceId: "src_aurora_stripe",
    tables: [
      { name: "charges", rowCount: 9_940, columns: [
        { name: "charge_id", type: "string" },
        { name: "amount", type: "currency" },
        { name: "status", type: "string", sample: "succeeded" },
        { name: "created_at", type: "date" },
      ] },
    ],
  },
};

const auroraMetrics: Metric[] = [
  { id: "aur_revenue", name: "Net Revenue", description: "Total order value after discounts and refunds.", category: "revenue", format: "currency", sourceIds: ["src_aurora_shopify", "src_aurora_stripe"] },
  { id: "aur_margin", name: "Gross Margin", description: "Revenue minus cost of goods sold, as a percentage of revenue.", category: "revenue", format: "percent", sourceIds: ["src_aurora_shopify"] },
  { id: "aur_cac", name: "Customer Acquisition Cost", description: "Ad spend divided by new customers acquired in the same period.", category: "marketing", format: "currency", sourceIds: ["src_aurora_shopify"] },
  { id: "aur_aov", name: "Average Order Value", description: "Net revenue divided by order count.", category: "revenue", format: "currency", sourceIds: ["src_aurora_shopify"] },
];

// Explorations only — see northwindWorkbooks's comment above.
const auroraWorkbooks: Workbook[] = [
  { id: "wb_aurora_growth", name: "Growth Snapshot", kind: "workbook", ownerId: "usr_maya", updatedAt: iso(subHours(now, 6)), views: 34, folder: "Growth", query: { source: "metric", key: "aur_revenue" } },
];

const auroraStarterQuestions: StarterQuestion[] = [
  { id: "q_aurora_revenue", question: "How has net revenue trended over the last 12 weeks?", hint: "aur_revenue" },
  { id: "q_aurora_cac_by_channel", question: "What's our customer acquisition cost by channel this month?", hint: "aurora_cac_channel" },
  { id: "q_aurora_aov", question: "How has average order value changed recently?", hint: "aur_aov" },
];

const auroraPresets: Record<string, QueryResult> = {
  aurora_cac_channel: {
    columns: [
      { key: "channel", label: "Channel", type: "string" },
      { key: "cac", label: "CAC", type: "currency" },
      { key: "customers", label: "New Customers", type: "number" },
    ],
    rows: [
      { channel: "Instagram Ads", cac: 24.5, customers: 142 },
      { channel: "Organic Search", cac: 3.8, customers: 96 },
      { channel: "Referral", cac: 6.2, customers: 58 },
    ],
    chartSuggestion: "bar",
    confidence: 0.86,
    sql: "select channel, sum(spend) / nullif(count(distinct new_customer_id), 0) as cac, count(distinct new_customer_id) as customers\nfrom marketing.ad_spend a join growth.new_customers c using (channel)\ngroup by 1 order by 2 desc",
    summary: "CAC by acquisition channel this month, from connected ad accounts and Shopify new-customer orders.",
  },
};

const auroraQueryEngine = createQueryEngine(
  auroraWorkspace.id,
  auroraMetrics,
  {
    aur_revenue: { start: 17_500, trend: 0.021, vol: 1800, seed: 23 },
    aur_margin: { start: 47, trend: 0.003, vol: 1.6, seed: 29 },
    aur_cac: { start: 22, trend: -0.006, vol: 2.1, seed: 31 },
    aur_aov: { start: 61, trend: 0.004, vol: 2.8, seed: 37 },
  },
  auroraPresets,
  auroraStarterQuestions,
  { channel: "aurora_cac_channel" },
);

const auroraReports: Report[] = [
  {
    id: "rpt_aurora_investor",
    workspaceId: auroraWorkspace.id,
    name: "Investor Update (Q3)",
    description: "Headline growth metrics for the quarterly investor email.",
    blocks: [
      { id: "blk_aurora_kpi_revenue", type: "kpi", layout: { x: 0, y: 0, w: 4, h: 4 }, config: { metricId: "aur_revenue", label: "Net Revenue", delta: 6.1 } },
      { id: "blk_aurora_kpi_margin", type: "kpi", layout: { x: 4, y: 0, w: 4, h: 4 }, config: { metricId: "aur_margin", label: "Gross Margin", delta: 0.8 } },
      { id: "blk_aurora_kpi_cac", type: "kpi", layout: { x: 8, y: 0, w: 4, h: 4 }, config: { metricId: "aur_cac", label: "CAC", delta: -3.2 } },
      { id: "blk_aurora_chart", type: "chart", layout: { x: 0, y: 4, w: 12, h: 8 }, config: { metricId: "aur_revenue", chartType: "line", title: "Net Revenue (last 12 weeks)" } },
    ],
    ownerId: currentUser.id,
    updatedAt: iso(subDays(now, 2)),
    views: 19,
    folder: "Finance",
  },
];

const auroraLift = buildLiftSeries(6, 6_200, 0.052, 53);

const auroraExperiments: Experiment[] = [
  {
    id: "exp_aurora_instagram_geo",
    workspaceId: auroraWorkspace.id,
    name: "Instagram Ads Geo Holdout (Northeast)",
    hypothesis: "Boosting Instagram spend in test metros drives incremental revenue beyond organic growth alone.",
    metricId: "aur_revenue",
    unitType: "geo",
    treatment: { units: ["Boston", "Providence"], share: 0.28 },
    holdout: { units: ["Hartford", "Portland ME"], share: 0.15 },
    startDate: iso(subWeeks(now, 6)).slice(0, 10),
    endDate: iso(subWeeks(now, 0)).slice(0, 10),
    status: "running",
    ownerId: "usr_maya",
    createdAt: iso(subWeeks(now, 6)),
    result: { liftPct: 0.052, incrementalValue: 4_180, confidenceInterval: [0.008, 0.096], significance: 0.74, ...auroraLift },
  },
];

const auroraSyncRuns: Record<string, SyncRun[]> = {
  src_aurora_shopify: [
    { id: "run_aurora_shop_2", sourceId: "src_aurora_shopify", idempotencyKey: "sync_aurora_shopify_2026w36", attempt: 1, status: "success", startedAt: iso(subMinutes(now, 26)), finishedAt: iso(subMinutes(now, 25)), rowsUpserted: 38_412 },
    { id: "run_aurora_shop_1", sourceId: "src_aurora_shopify", idempotencyKey: "sync_aurora_shopify_2026w35", attempt: 1, status: "success", startedAt: iso(subDays(now, 1)), finishedAt: iso(subDays(now, 1)), rowsUpserted: 38_055 },
  ],
};

const auroraBundle: WorkspaceBundle = {
  workspace: auroraWorkspace,
  myRole: "admin",
  members: auroraMembers,
  dataSources: auroraDataSources,
  schemaBySource: auroraSchemaBySource,
  metrics: auroraMetrics,
  workbooks: auroraWorkbooks,
  reports: auroraReports,
  experiments: auroraExperiments,
  syncRunsBySource: auroraSyncRuns,
  starterQuestions: auroraStarterQuestions,
  dimensionPresetKeys: { channel: "aurora_cac_channel" },
  isMetricId: auroraQueryEngine.isMetricId,
  getResultByKey: auroraQueryEngine.getResultByKey,
  resolveQuery: auroraQueryEngine.resolveQuery,
  pivotResult: auroraQueryEngine.pivotResult,
};

// ---------------------------------------------------------------------------
// Public surface: every bundle, keyed by workspace id
// ---------------------------------------------------------------------------

export const workspaceBundles: Record<string, WorkspaceBundle> = {
  [northwindWorkspace.id]: northwindBundle,
  [auroraWorkspace.id]: auroraBundle,
};

export const defaultWorkspaceId = northwindWorkspace.id;

/**
 * Looks up a *seeded* bundle by id, and only that — no silent fallback to
 * the default workspace for an id that isn't one of these. That fallback
 * used to live here, back when there was only ever one workspace to fall
 * back to; once `switchWorkspace` started relying on "does a bundle exist
 * for this id" to decide whether to honor a switch, the same fallback
 * silently made that membership check unreachable (any id at all "existed",
 * via the default). Callers that want "recover to the default if unknown"
 * now do that explicitly at the one or two call sites that actually mean it
 * (see adapter.ts), instead of it being baked into every lookup.
 */
export function getBundle(workspaceId: string): WorkspaceBundle | undefined {
  return workspaceBundles[workspaceId];
}

export function listWorkspaceSummaries(): WorkspaceSummary[] {
  return Object.values(workspaceBundles).map((b) => ({
    id: b.workspace.id,
    name: b.workspace.name,
    slug: b.workspace.slug,
    plan: b.workspace.plan,
    myRole: b.myRole,
  }));
}
