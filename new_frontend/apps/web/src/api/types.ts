import type {
  CreateDataSourceInput,
  CreateExperimentInput,
  CreateReportInput,
  CreateWorkbookInput,
  CreateWorkspaceInput,
  DataSource,
  DatasetSchema,
  Experiment,
  Metric,
  PivotResult,
  QueryResult,
  Report,
  RunPivotQueryInput,
  RunQueryInput,
  SyncRun,
  UpdateExperimentInput,
  UpdateReportInput,
  User,
  Workbook,
  Workspace,
  WorkspaceSummary,
} from "@apicem/api-contract";
import type { StarterQuestion } from "./mock/fixtures";

/**
 * The full surface the frontend needs from the backend. Both the mock and
 * real adapters implement this exact interface — every screen is written
 * against `apiClient` from `./client`, never against the mock or real
 * adapter directly, so swapping one env var moves the whole app onto a real
 * backend with no component changes.
 */
export interface ApiClient {
  getCurrentUser(): Promise<User>;
  getCurrentWorkspace(): Promise<Workspace>;
  listTeamMembers(): Promise<User[]>;
  /** Every workspace the session's user belongs to, each with their own role in it — for the switcher. */
  listMyWorkspaces(): Promise<WorkspaceSummary[]>;
  /**
   * Re-scopes the session to a different workspace the user is already a
   * member of. This is the one place a "which workspace" value legitimately
   * crosses the wire from the client — the backend must still independently
   * verify membership before honoring it, never treat the id as
   * self-authorizing. Every *data* request made afterward still derives its
   * scope from the session, exactly as before — see SECURITY.md.
   */
  switchWorkspace(workspaceId: string): Promise<Workspace>;
  /** Creates a new workspace (current user becomes owner) and also switches the session into it — same cache-invalidation implications as switchWorkspace. */
  createWorkspace(input: CreateWorkspaceInput): Promise<Workspace>;

  listDataSources(): Promise<DataSource[]>;
  getDataSourceSchema(sourceId: string): Promise<DatasetSchema>;
  createDataSource(input: CreateDataSourceInput): Promise<DataSource>;
  removeDataSource(sourceId: string): Promise<void>;
  listSyncRuns(sourceId: string): Promise<SyncRun[]>;
  /** Re-runs a source's sync. Must be safe to call repeatedly on the same failed run — see SyncRun's doc comment. */
  retrySync(sourceId: string): Promise<SyncRun>;

  listMetrics(): Promise<Metric[]>;
  listStarterQuestions(): Promise<StarterQuestion[]>;
  runQuery(input: RunQueryInput): Promise<QueryResult>;
  /** Re-resolves the data behind a saved report block (a metric series or a named preset result). */
  getBlockData(source: "metric" | "preset", key: string): Promise<QueryResult>;
  /** Rows, columns, and metrics as independent shelves — see PivotResult's doc comment for why this doesn't reuse QueryResult's flat shape. */
  runPivotQuery(input: RunPivotQueryInput): Promise<PivotResult>;

  listWorkbooks(): Promise<Workbook[]>;
  getWorkbook(workbookId: string): Promise<Workbook>;
  createWorkbook(input: CreateWorkbookInput): Promise<Workbook>;
  /** Only ever called for a `kind: "workbook"` (exploration) row — a `kind: "report"` row has no stored record of its own to delete, see Workbook.kind's doc comment; deleteReport is the one for those. */
  deleteWorkbook(workbookId: string): Promise<void>;
  /**
   * Records one view against the Home-page card shared by a report or an
   * exploration (both are `Workbook` rows there — see Workbook.kind). A
   * deliberate, separate action rather than a side effect of `getReport`/
   * `getWorkbook`: those are plain reads, called incidentally from places
   * that aren't a real view (e.g. "Add to report" re-fetching a report to
   * compute where to append a block) — folding the counter into them would
   * inflate it on every incidental fetch. The frontend calls this once, only
   * from the pages that actually display a report or exploration to the
   * user; the counting itself — the read-modify-write — stays server-side.
   */
  recordWorkbookView(workbookId: string): Promise<void>;
  listReports(): Promise<Report[]>;
  getReport(reportId: string): Promise<Report>;
  createReport(input: CreateReportInput): Promise<Report>;
  updateReport(reportId: string, input: UpdateReportInput): Promise<Report>;
  deleteReport(reportId: string): Promise<void>;

  listExperiments(): Promise<Experiment[]>;
  getExperiment(experimentId: string): Promise<Experiment>;
  createExperiment(input: CreateExperimentInput): Promise<Experiment>;
  /** Edits an experiment's design, regardless of its current status. */
  updateExperiment(experimentId: string, input: UpdateExperimentInput): Promise<Experiment>;
  deleteExperiment(experimentId: string): Promise<void>;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
