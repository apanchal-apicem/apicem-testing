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
import type { ApiClient } from "../types";
import { ApiError } from "../types";
import type { StarterQuestion } from "../mock/fixtures";

/**
 * Talks to the real backend once it exists. Every method mirrors the mock
 * adapter's shape exactly (see ../types.ts) — point VITE_API_BASE_URL at the
 * backend and set VITE_USE_MOCK=false, and no component code changes.
 *
 * Expected REST surface (adjust paths here only, if the backend lands on a
 * different scheme — this is the one file that should need to change):
 *   GET    /me                              -> User
 *   GET    /workspace                        -> Workspace   (the session's *active* workspace)
 *   GET    /workspace/members                -> User[]
 *   GET    /workspaces                       -> WorkspaceSummary[]  (every workspace the session's user belongs to)
 *   POST   /workspaces/:id/switch            -> Workspace   (re-scopes the session — see below)
 *   POST   /workspaces                       -> Workspace   (creates one, current user becomes owner, and switches the session into it — same as switch above)
 *   GET    /data-sources                     -> DataSource[]
 *   GET    /data-sources/:id/schema          -> DatasetSchema
 *   POST   /data-sources                     -> DataSource
 *   DELETE /data-sources/:id                 -> void
 *   GET    /data-sources/:id/sync-runs       -> SyncRun[]
 *   POST   /data-sources/:id/sync            -> SyncRun   (send Idempotency-Key header — see below)
 *   GET    /metrics                          -> Metric[]
 *   GET    /starter-questions                -> StarterQuestion[]
 *   POST   /query                            -> QueryResult
 *   GET    /blocks/data?source=&key=          -> QueryResult
 *   GET    /workbooks                        -> Workbook[]   (every report AND every exploration, merged — a report has no separate "workbook" row of its own to create, rename, or delete in step with; the backend derives its card from the Report row itself, the same way the mock adapter's listAllWorkbooks does)
 *   GET    /workbooks/:id                    -> Workbook
 *   POST   /workbooks                        -> Workbook     (explorations only — a report is created via POST /reports and appears here automatically)
 *   POST   /workbooks/:id/view                -> void      (fire-and-forget from the frontend; the increment itself is atomic server-side, see recordWorkbookView's doc comment in api/types.ts)
 *   GET    /reports                          -> Report[]
 *   GET    /reports/:id                      -> Report
 *   POST   /reports                          -> Report
 *   PATCH  /reports/:id                      -> Report
 *   DELETE /reports/:id                      -> void
 *   GET    /experiments                      -> Experiment[]
 *   GET    /experiments/:id                  -> Experiment
 *   POST   /experiments                      -> Experiment
 *
 * Every request rides on a session cookie (`credentials: "include"`); the
 * backend derives the workspace from that session, never from anything in
 * the request body. `switchWorkspace` is the one deliberate exception — see
 * SECURITY.md, "Tenant isolation" and "Switching workspaces," for why that's
 * a different, privileged kind of action and not a crack in the rule above.
 *
 * `retrySync` sends a client-generated `Idempotency-Key` header so a
 * double-click or a network-layer retry of the *request itself* collapses
 * into one attempt at the HTTP layer, on top of the row-level upsert
 * idempotency the backend's sync job already guarantees. See SECURITY.md,
 * "Idempotent sync runs."
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(body || `Request to ${path} failed with ${res.status}`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const realClient: ApiClient = {
  getCurrentUser: () => request<User>("/me"),
  getCurrentWorkspace: () => request<Workspace>("/workspace"),
  listTeamMembers: () => request<User[]>("/workspace/members"),
  listMyWorkspaces: () => request<WorkspaceSummary[]>("/workspaces"),
  switchWorkspace: (workspaceId) => request<Workspace>(`/workspaces/${workspaceId}/switch`, { method: "POST" }),
  createWorkspace: (input: CreateWorkspaceInput) =>
    request<Workspace>("/workspaces", { method: "POST", body: JSON.stringify(input) }),

  listDataSources: () => request<DataSource[]>("/data-sources"),
  getDataSourceSchema: (sourceId) => request<DatasetSchema>(`/data-sources/${sourceId}/schema`),
  createDataSource: (input: CreateDataSourceInput) =>
    request<DataSource>("/data-sources", { method: "POST", body: JSON.stringify(input) }),
  removeDataSource: (sourceId) => request<void>(`/data-sources/${sourceId}`, { method: "DELETE" }),
  listSyncRuns: (sourceId) => request<SyncRun[]>(`/data-sources/${sourceId}/sync-runs`),
  retrySync: (sourceId) =>
    request<SyncRun>(`/data-sources/${sourceId}/sync`, {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
    }),

  listMetrics: () => request<Metric[]>("/metrics"),
  listStarterQuestions: () => request<StarterQuestion[]>("/starter-questions"),
  runQuery: (input: RunQueryInput) => request<QueryResult>("/query", { method: "POST", body: JSON.stringify(input) }),
  getBlockData: (source, key) =>
    request<QueryResult>(`/blocks/data?source=${encodeURIComponent(source)}&key=${encodeURIComponent(key)}`),
  runPivotQuery: (input: RunPivotQueryInput) => request<PivotResult>("/pivot-query", { method: "POST", body: JSON.stringify(input) }),

  listWorkbooks: () => request<Workbook[]>("/workbooks"),
  getWorkbook: (workbookId) => request<Workbook>(`/workbooks/${workbookId}`),
  createWorkbook: (input: CreateWorkbookInput) =>
    request<Workbook>("/workbooks", { method: "POST", body: JSON.stringify(input) }),
  deleteWorkbook: (workbookId) => request<void>(`/workbooks/${workbookId}`, { method: "DELETE" }),
  recordWorkbookView: (workbookId) => request<void>(`/workbooks/${workbookId}/view`, { method: "POST" }),
  listReports: () => request<Report[]>("/reports"),
  getReport: (reportId) => request<Report>(`/reports/${reportId}`),
  createReport: (input: CreateReportInput) =>
    request<Report>("/reports", { method: "POST", body: JSON.stringify(input) }),
  updateReport: (reportId, input: UpdateReportInput) =>
    request<Report>(`/reports/${reportId}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteReport: (reportId) => request<void>(`/reports/${reportId}`, { method: "DELETE" }),

  listExperiments: () => request<Experiment[]>("/experiments"),
  getExperiment: (experimentId) => request<Experiment>(`/experiments/${experimentId}`),
  createExperiment: (input: CreateExperimentInput) =>
    request<Experiment>("/experiments", { method: "POST", body: JSON.stringify(input) }),
  updateExperiment: (experimentId, input: UpdateExperimentInput) =>
    request<Experiment>(`/experiments/${experimentId}`, { method: "PATCH", body: JSON.stringify(input) }),
  deleteExperiment: (experimentId) => request<void>(`/experiments/${experimentId}`, { method: "DELETE" }),
};
