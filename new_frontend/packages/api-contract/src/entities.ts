/**
 * Read-side shapes: what the API returns. These are the types both the
 * frontend's mock adapter and the real backend must produce identical
 * instances of.
 *
 * Security invariant: every entity below that carries a `workspaceId` is
 * scoped to it server-side, derived from the authenticated session — never
 * from a client-supplied field on a data request. `switchWorkspace` in
 * requests.ts is the one deliberate, narrow exception: it's not a data query
 * accepting a scope, it's the privileged, membership-verified action that
 * *changes* which workspace the session resolves to afterward — see
 * SECURITY.md, "Tenant isolation" and "Switching workspaces," for why those
 * are different things and must stay different.
 */

export type Role = "owner" | "admin" | "editor" | "viewer";

export interface User {
  id: string;
  name: string;
  email: string;
  /** This user's role in whichever workspace is currently active — role is per-membership, not global; see WorkspaceSummary. */
  role: Role;
  avatarColor: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  plan: "starter" | "growth" | "enterprise";
  memberCount: number;
}

/**
 * One workspace the current user belongs to, for the switcher — distinct
 * from `Workspace` in that it always carries the viewer's own role in *that*
 * workspace (which can differ workspace to workspace: owner of one,
 * invited-as-editor on a client's), without requiring a separate request per
 * workspace to find out.
 */
export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  plan: Workspace["plan"];
  myRole: Role;
}

export type DataSourceType =
  | "snowflake"
  | "bigquery"
  | "redshift"
  | "postgres"
  | "google_sheets"
  | "shopify"
  | "quickbooks"
  | "stripe"
  | "square";

export type DataSourceStatus = "connected" | "syncing" | "error" | "pending";

export interface DataSource {
  id: string;
  workspaceId: string;
  type: DataSourceType;
  name: string;
  status: DataSourceStatus;
  lastSyncedAt: string | null;
  tableCount: number;
  rowCount: number;
  errorMessage?: string;
}

export type ColumnType = "string" | "number" | "date" | "boolean" | "currency";

export interface SchemaColumn {
  name: string;
  type: ColumnType;
  sample?: string;
}

export interface SchemaTable {
  name: string;
  rowCount: number;
  columns: SchemaColumn[];
}

export interface DatasetSchema {
  sourceId: string;
  tables: SchemaTable[];
}

export type MetricCategory = "revenue" | "cost" | "growth" | "engagement" | "marketing";
export type MetricFormat = "currency" | "percent" | "number";

export interface Metric {
  id: string;
  name: string;
  description: string;
  category: MetricCategory;
  format: MetricFormat;
  sourceIds: string[];
}

export type ChartType = "kpi" | "line" | "bar" | "area" | "table" | "donut";

export interface QueryColumn {
  key: string;
  label: string;
  type: ColumnType;
}

export interface QueryResult {
  columns: QueryColumn[];
  rows: Array<Record<string, string | number>>;
  chartSuggestion: ChartType;
  confidence: number;
  sql?: string;
  summary: string;
  /** Stable identifier the backend resolved this answer to (a metric id or a named result key) — pass this back via getBlockData to re-fetch the same answer later, e.g. when rendering a saved report block. */
  resolvedKey?: string;
}

/**
 * One pivoted column header — a single combination of values across every
 * dimension on the Columns shelf (e.g. ["Q1", "Meta Ads"] for two column
 * dimensions), joined into `key` the same way a row's dimension values are
 * joined into `PivotRow.rowKey`. Absent (an empty columnGroups array)
 * exactly when the Columns shelf is empty — every metric then gets a
 * single, ungrouped column instead of one per combination.
 */
export interface PivotColumnGroup {
  key: string;
  label: string;
  values: string[];
}

export interface PivotRow {
  /** Composite label for this row's combination of Rows-shelf dimension values, e.g. "Meta Ads / Outerwear". */
  rowKey: string;
  /** One value per Rows-shelf dimension, in shelf order — each becomes its own row-label column. */
  rowValues: string[];
  /** Keyed `${columnGroup.key}::${metricId}` when there are column groups, or just `metricId` when there are none. */
  cells: Record<string, number>;
}

/**
 * The result of a pivot query — Rows and Columns dimensions are genuinely
 * independent shelves (unlike runQuery's single `dimensions` list, where
 * count alone decides whether something is a breakdown or a cross-tab),
 * so this carries its own shape rather than overloading QueryResult's flat
 * columns/rows. Deliberately flat, not a nested/collapsible row tree: every
 * unique combination of Rows-shelf values is its own row, the same
 * approach runQuery's cross-tab already takes, just with no cap on how
 * many dimensions (or metrics) contribute.
 */
export interface PivotResult {
  rowDimensions: QueryColumn[];
  columnGroups: PivotColumnGroup[];
  metricIds: string[];
  metricLabels: Record<string, string>;
  metricFormats: Record<string, MetricFormat>;
  rows: PivotRow[];
  /** Grand total per cell key, same keying as PivotRow.cells. */
  totals: Record<string, number>;
  confidence: number;
  summary: string;
}

export type ReportBlockType = "kpi" | "chart" | "table" | "pivot" | "text" | "divider" | "image";

export interface ReportBlockLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ReportBlock {
  id: string;
  type: ReportBlockType;
  layout: ReportBlockLayout;
  config: Record<string, unknown>;
}

export interface Report {
  id: string;
  workspaceId: string;
  name: string;
  description?: string;
  blocks: ReportBlock[];
  ownerId: string;
  updatedAt: string;
  views: number;
  folder?: string;
}

export interface Workbook {
  id: string;
  name: string;
  kind: "workbook" | "report";
  ownerId: string;
  updatedAt: string;
  views: number;
  folder?: string;
  /**
   * What a `kind: "workbook"` (exploration) shows when reopened — a report
   * stores its own state in Report.blocks instead, so this is absent there.
   * Same {source, key} shape as a report block's chart/KPI config and
   * `getBlockData`, so reopening one is just resolving this like any other
   * saved reference to a metric or preset result. `question` is the literal
   * text that was asked, present only when this was saved from a typed or
   * starter question rather than built manually via the Value/Group-by
   * shelves — its absence is what tells the reopened view to label the turn
   * "Built manually" instead of putting words in the user's mouth.
   */
  query?: { source: "metric" | "preset"; key: string; question?: string };
}

/**
 * Incrementality experiments — geo-split (or segment-split) holdout tests
 * that measure the causal lift of a spend change, distinct from the
 * correlational attribution `runQuery` answers. This is the thing most BI
 * tools don't offer: a real experiment, not a dashboard guess.
 */
export type ExperimentStatus = "draft" | "running" | "completed";
export type ExperimentUnitType = "geo" | "customer_segment";

export interface ExperimentGroup {
  /** Names of geos or segments assigned to this arm — never individual customer/user ids. */
  units: string[];
  /** Share of total addressable units, 0-1, for display only. */
  share: number;
}

export interface ExperimentResult {
  /** Estimated causal lift, as a fraction (0.084 = 8.4%) attributable to the treatment. */
  liftPct: number;
  /** Incremental value in the metric's own unit (e.g. incremental revenue in dollars). */
  incrementalValue: number;
  /** 90% confidence interval around liftPct, as [low, high] fractions. */
  confidenceInterval: [number, number];
  /** Probability this lift reflects a real effect rather than noise, 0-1. */
  significance: number;
  /** Incremental return on ad spend for the tested channel/campaign, if spend data was available. */
  iroas?: number;
  treatmentSeries: Array<{ date: string; value: number }>;
  holdoutSeries: Array<{ date: string; value: number }>;
}

export interface Experiment {
  id: string;
  workspaceId: string;
  name: string;
  hypothesis: string;
  metricId: string;
  unitType: ExperimentUnitType;
  treatment: ExperimentGroup;
  holdout: ExperimentGroup;
  startDate: string;
  endDate: string;
  status: ExperimentStatus;
  ownerId: string;
  createdAt: string;
  result?: ExperimentResult;
}

/**
 * One attempt at syncing a data source. Sync runs are idempotent by design:
 * re-running a failed (or successful) run with the same `idempotencyKey`
 * must upsert on each row's natural key rather than insert, so retrying
 * after a bug fix can never produce duplicate rows. `rowsUpserted` staying
 * identical across a retry — never adding on top of the prior attempt's
 * count — is exactly what the frontend's sync-history view is built to
 * make visible. See SECURITY.md, "Idempotent sync runs."
 */
export type SyncRunStatus = "success" | "failed" | "running";

export interface SyncRun {
  id: string;
  sourceId: string;
  idempotencyKey: string;
  attempt: number;
  status: SyncRunStatus;
  startedAt: string;
  finishedAt: string | null;
  rowsUpserted: number;
  errorMessage?: string;
}
