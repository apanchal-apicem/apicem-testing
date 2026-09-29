import type {
  CreateDataSourceInput,
  CreateExperimentInput,
  CreateReportInput,
  CreateWorkbookInput,
  CreateWorkspaceInput,
  DataSource,
  Experiment,
  QueryFilter,
  QueryResult,
  Report,
  RunPivotQueryInput,
  RunQueryInput,
  SyncRun,
  UpdateExperimentInput,
  UpdateReportInput,
  Workbook,
  Workspace,
} from "@apicem/api-contract";
import type { ApiClient } from "../types";
import { ApiError } from "../types";
import { createQueryEngine, currentUser, defaultWorkspaceId, getBundle, listWorkspaceSummaries, type WorkspaceBundle } from "./fixtures";

// Real network latency to simulate, kept low on purpose: this is standing in
// for a backend that (per PERFORMANCE.md) should be answering cached/indexed
// reads in well under 100ms. A slow mock would train the UI to feel fine
// with a slow backend — better to build every screen assuming fast responses
// and let a genuinely slow real endpoint be the thing that stands out later.
const LATENCY = { min: 40, max: 130 };

function wait<T>(value: T): Promise<T> {
  const ms = LATENCY.min + Math.random() * (LATENCY.max - LATENCY.min);
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function loadState<T>(key: string, seed: T): T {
  if (typeof window === "undefined") return seed;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return seed;
    return JSON.parse(raw) as T;
  } catch {
    return seed;
  }
}

function saveState<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

// Namespaced by workspace, per SECURITY.md's tenant-isolation rule modeled
// even at the mock's storage layer: switching workspaces switches which
// bucket every read/write below resolves against. The one deliberate
// exception is ACTIVE_WORKSPACE_KEY itself — that's the pointer that says
// *which* workspace-scoped bucket is current, so it can't be scoped by the
// thing it's pointing at.
const workspaceKey = (workspaceId: string, name: string) => `apicem.mock.${workspaceId}.${name}`;
const ACTIVE_WORKSPACE_KEY = "apicem.mock.activeWorkspaceId";
const CUSTOM_WORKSPACES_KEY = "apicem.mock.customWorkspaces";

interface CustomWorkspaceRecord {
  id: string;
  name: string;
  slug: string;
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "workspace";
}

/** A brand-new workspace starts genuinely empty — no sources, no metrics, nothing to ask — the same "connect a source first" state onboarding already walks a user through, rather than a fake pre-populated demo. */
function createEmptyBundle(workspace: Workspace): WorkspaceBundle {
  const engine = createQueryEngine(workspace.id, [], {}, {}, [], {});
  return {
    workspace,
    myRole: "owner",
    members: [{ ...currentUser, role: "owner" }],
    dataSources: [],
    schemaBySource: {},
    metrics: [],
    workbooks: [],
    reports: [],
    experiments: [],
    syncRunsBySource: {},
    starterQuestions: [],
    dimensionPresetKeys: {},
    isMetricId: engine.isMetricId,
    getResultByKey: engine.getResultByKey,
    resolveQuery: engine.resolveQuery,
    pivotResult: engine.pivotResult,
  };
}

// Custom (user-created) workspaces reconstructed from their persisted
// {id, name, slug} record on load — each still gets its own genuinely empty
// bundle; any data source/report/experiment a user later adds to one lives
// in that workspace's own namespaced storage exactly like a seed workspace's.
const customWorkspaces = loadState<CustomWorkspaceRecord[]>(CUSTOM_WORKSPACES_KEY, []);
const customBundles: Record<string, WorkspaceBundle> = {};
for (const record of customWorkspaces) {
  customBundles[record.id] = createEmptyBundle({ id: record.id, name: record.name, slug: record.slug, plan: "starter", memberCount: 1 });
}

function getBundleFor(workspaceId: string): WorkspaceBundle | undefined {
  return customBundles[workspaceId] ?? getBundle(workspaceId);
}

let activeWorkspaceId = loadState<string>(ACTIVE_WORKSPACE_KEY, defaultWorkspaceId);
if (!getBundleFor(activeWorkspaceId)) activeWorkspaceId = defaultWorkspaceId;

/**
 * Every read below assumes the active workspace resolves to a real bundle —
 * true by construction, since `activeWorkspaceId` is only ever set (above,
 * or in `switchWorkspace`/`createWorkspace` below) after `getBundleFor`
 * already confirmed a bundle exists for that id. Throws rather than ever
 * silently substituting a different workspace's data if that invariant is
 * somehow violated.
 */
function getActiveBundle(): WorkspaceBundle {
  const bundle = getBundleFor(activeWorkspaceId);
  if (!bundle) throw new ApiError(`Active workspace "${activeWorkspaceId}" no longer exists`, 500);
  return bundle;
}

/** The mutable, user-editable slice of a workspace's data — everything else on a bundle (metrics, schema, members, the query engine) is fixed reference data for that workspace. */
interface WorkspaceSlice {
  dataSources: DataSource[];
  workbooks: Workbook[];
  reports: Report[];
  experiments: Experiment[];
  syncRunsBySource: Record<string, SyncRun[]>;
}

const sliceCache = new Map<string, WorkspaceSlice>();

function getSlice(workspaceId: string): WorkspaceSlice {
  let slice = sliceCache.get(workspaceId);
  if (!slice) {
    const bundle = getBundleFor(workspaceId);
    if (!bundle) throw new ApiError(`Workspace "${workspaceId}" not found`, 500);
    slice = {
      dataSources: loadState(workspaceKey(workspaceId, "dataSources"), bundle.dataSources),
      // Filtered rather than trusted as-is: a browser that persisted state
      // before reports stopped being mirrored in here (see northwindWorkbooks's
      // doc comment) can still have stale kind:"report" rows saved locally —
      // self-heals on load instead of showing a report's card twice.
      workbooks: loadState(workspaceKey(workspaceId, "workbooks"), bundle.workbooks).filter((w) => w.kind !== "report"),
      reports: loadState(workspaceKey(workspaceId, "reports"), bundle.reports),
      experiments: loadState(workspaceKey(workspaceId, "experiments"), bundle.experiments),
      syncRunsBySource: loadState(workspaceKey(workspaceId, "syncRuns"), bundle.syncRunsBySource),
    };
    sliceCache.set(workspaceId, slice);
  }
  return slice;
}

function setSlice(workspaceId: string, patch: Partial<WorkspaceSlice>) {
  const slice = getSlice(workspaceId);
  Object.assign(slice, patch);
  if (patch.dataSources) saveState(workspaceKey(workspaceId, "dataSources"), slice.dataSources);
  if (patch.workbooks) saveState(workspaceKey(workspaceId, "workbooks"), slice.workbooks);
  if (patch.reports) saveState(workspaceKey(workspaceId, "reports"), slice.reports);
  if (patch.experiments) saveState(workspaceKey(workspaceId, "experiments"), slice.experiments);
  if (patch.syncRunsBySource) saveState(workspaceKey(workspaceId, "syncRuns"), slice.syncRunsBySource);
}

/**
 * A report's Home-page card is derived from the Report itself, not a second
 * stored copy — see northwindWorkbooks's doc comment for why keeping two
 * mutable records in sync was the actual bug behind reports not showing up
 * on Home after being created.
 */
function reportToWorkbook(report: Report): Workbook {
  return {
    id: report.id,
    name: report.name,
    kind: "report",
    ownerId: report.ownerId,
    updatedAt: report.updatedAt,
    views: report.views,
    folder: report.folder,
  };
}

/** Every card the Home-page grid shows, reports and explorations both, freshly merged — never a stored list of its own. */
function listAllWorkbooks(workspaceId: string): Workbook[] {
  const slice = getSlice(workspaceId);
  return [...slice.reports.map(reportToWorkbook), ...slice.workbooks].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}

function matchesFilter(cell: string | number | undefined, filter: QueryFilter): boolean {
  switch (filter.operator) {
    case "eq":
      return String(cell ?? "").toLowerCase() === String(filter.value).toLowerCase();
    case "neq":
      return String(cell ?? "").toLowerCase() !== String(filter.value).toLowerCase();
    case "contains":
      return String(cell ?? "").toLowerCase().includes(String(filter.value).toLowerCase());
    case "gt":
      return Number(cell) > Number(filter.value);
    case "gte":
      return Number(cell) >= Number(filter.value);
    case "lt":
      return Number(cell) < Number(filter.value);
    case "lte":
      return Number(cell) <= Number(filter.value);
    default:
      return true;
  }
}

/**
 * Filters a result's rows in place of the query engine that produced it —
 * the same filters array applies whether the result came from a metric
 * series, a named preset, or a free-typed question, since it only ever
 * looks at the columns the result actually has. A filter naming a column
 * the result doesn't carry (asking a metric with no dimension, then
 * filtering by one) is left as a no-op rather than an error — there's
 * nothing wrong with the request, just nothing for it to restrict.
 */
function applyFilters(result: QueryResult, filters: QueryFilter[] | undefined): QueryResult {
  if (!filters || filters.length === 0) return result;
  const applicable = filters.filter((f) => result.columns.some((c) => c.key === f.column));
  if (applicable.length === 0) return result;
  return { ...result, rows: result.rows.filter((row) => applicable.every((f) => matchesFilter(row[f.column], f))) };
}

const sourceLabels: Record<CreateDataSourceInput["type"], string> = {
  snowflake: "Snowflake",
  bigquery: "BigQuery",
  redshift: "Redshift",
  postgres: "Postgres",
  google_sheets: "Google Sheets",
  shopify: "Shopify",
  quickbooks: "QuickBooks Online",
  stripe: "Stripe",
  square: "Square",
};

/**
 * Wipes every bit of mock-adapter state — every workspace, seeded or
 * custom-created, plus the active-workspace pointer and the persisted query
 * cache — then reloads to a pristine first-run state.
 *
 * Exists for one reason: this demo's only storage is the browser's own
 * localStorage, so a long stretch of hands-on demoing (a booth, a walkthrough
 * with several stakeholders back to back) accumulates real edits — a retried
 * sync, an extra workspace, a deleted source — and without this, the next
 * person's first look is whatever the previous person left behind, not the
 * demo. Deliberately not part of `ApiClient`: a real backend has no
 * equivalent "wipe my tenant" endpoint, so this only exists on the mock and
 * is gated behind `isMockMode` at the one call site (Settings).
 */
export function resetMockData() {
  if (typeof window === "undefined") return;
  const keysToRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key && (key.startsWith("apicem.mock.") || key === "apicem.queryCache")) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => window.localStorage.removeItem(key));
  window.location.reload();
}

export const mockClient: ApiClient = {
  async getCurrentUser() {
    const bundle = getActiveBundle();
    return wait({ ...currentUser, role: bundle.myRole });
  },
  async getCurrentWorkspace() {
    return wait(getActiveBundle().workspace);
  },
  async listTeamMembers() {
    return wait(getActiveBundle().members);
  },
  async listMyWorkspaces() {
    // In a real backend this is "workspaces this session's user is a member
    // of" — the mock only ever has one user, so that's every bundle, seed or
    // custom.
    return wait([...listWorkspaceSummaries(), ...Object.values(customBundles).map((b) => ({ id: b.workspace.id, name: b.workspace.name, slug: b.workspace.slug, plan: b.workspace.plan, myRole: b.myRole }))]);
  },
  async switchWorkspace(workspaceId) {
    const bundle = getBundleFor(workspaceId);
    if (!bundle) throw new ApiError(`Not a member of workspace "${workspaceId}"`, 403);
    activeWorkspaceId = workspaceId;
    saveState(ACTIVE_WORKSPACE_KEY, activeWorkspaceId);
    return wait(bundle.workspace);
  },
  async createWorkspace(input: CreateWorkspaceInput) {
    const id = `wksp_${Math.random().toString(36).slice(2, 9)}`;
    const workspace: Workspace = { id, name: input.name, slug: slugify(input.name), plan: "starter", memberCount: 1 };
    customBundles[id] = createEmptyBundle(workspace);
    customWorkspaces.push({ id, name: workspace.name, slug: workspace.slug });
    saveState(CUSTOM_WORKSPACES_KEY, customWorkspaces);
    activeWorkspaceId = id;
    saveState(ACTIVE_WORKSPACE_KEY, activeWorkspaceId);
    return wait(workspace);
  },

  async listDataSources() {
    return wait(getSlice(activeWorkspaceId).dataSources);
  },
  async getDataSourceSchema(sourceId) {
    const schema = getActiveBundle().schemaBySource[sourceId];
    if (!schema) throw new ApiError(`No schema found for source "${sourceId}"`, 404);
    return wait(schema);
  },
  async createDataSource(input) {
    const workspaceId = activeWorkspaceId;
    const created: DataSource = {
      id: `src_${input.type}_${Math.random().toString(36).slice(2, 8)}`,
      workspaceId,
      type: input.type,
      name: input.name || `New ${sourceLabels[input.type]} connection`,
      status: "syncing",
      lastSyncedAt: null,
      tableCount: 0,
      rowCount: 0,
    };
    setSlice(workspaceId, { dataSources: [created, ...getSlice(workspaceId).dataSources] });
    return wait(created);
  },
  async removeDataSource(sourceId) {
    const workspaceId = activeWorkspaceId;
    setSlice(workspaceId, { dataSources: getSlice(workspaceId).dataSources.filter((s) => s.id !== sourceId) });
    return wait(undefined);
  },
  async listSyncRuns(sourceId) {
    return wait(getSlice(activeWorkspaceId).syncRunsBySource[sourceId] ?? []);
  },
  async retrySync(sourceId) {
    const workspaceId = activeWorkspaceId;
    const slice = getSlice(workspaceId);
    const source = slice.dataSources.find((s) => s.id === sourceId);
    if (!source) throw new ApiError(`Data source "${sourceId}" not found`, 404);

    const priorRuns = slice.syncRunsBySource[sourceId] ?? [];
    const lastRun = priorRuns[0];
    // Same idempotency key as the run being retried (or a fresh one for a source
    // with no history) — the backend upserts on each row's natural key under
    // this key, so this attempt lands on the source's true row count rather
    // than adding to whatever the failed attempt already wrote.
    const idempotencyKey = lastRun?.idempotencyKey ?? `sync_${sourceId}_${Date.now()}`;
    const attempt = (lastRun?.attempt ?? 0) + 1;
    const targetRowCount = source.rowCount || 1_204_552;

    const newRun: SyncRun = {
      id: `run_${Math.random().toString(36).slice(2, 9)}`,
      sourceId,
      idempotencyKey,
      attempt,
      status: "success",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      rowsUpserted: targetRowCount,
    };

    setSlice(workspaceId, {
      syncRunsBySource: { ...slice.syncRunsBySource, [sourceId]: [newRun, ...priorRuns] },
      dataSources: slice.dataSources.map((s) =>
        s.id === sourceId ? { ...s, status: "connected", errorMessage: undefined, lastSyncedAt: newRun.finishedAt } : s,
      ),
    });

    return wait(newRun);
  },

  async listMetrics() {
    return wait(getActiveBundle().metrics);
  },
  async listStarterQuestions() {
    return wait(getActiveBundle().starterQuestions);
  },
  async runQuery(input: RunQueryInput) {
    const result = getActiveBundle().resolveQuery(input.question, input.metricIds, input.dimensions);
    return wait(applyFilters(result, input.filters));
  },
  async runPivotQuery(input: RunPivotQueryInput) {
    const result = getActiveBundle().pivotResult(input.metricIds, input.rowDimensions, input.columnDimensions);
    return wait(result);
  },
  async getBlockData(_source, key) {
    const result = getActiveBundle().getResultByKey(key);
    if (!result) throw new ApiError(`No data resolves for key "${key}"`, 404);
    return wait(result);
  },

  async listWorkbooks() {
    return wait(listAllWorkbooks(activeWorkspaceId));
  },
  async getWorkbook(workbookId) {
    const workbook = listAllWorkbooks(activeWorkspaceId).find((w) => w.id === workbookId);
    if (!workbook) throw new ApiError(`Workbook "${workbookId}" not found`, 404);
    return wait(workbook);
  },
  async createWorkbook(input: CreateWorkbookInput) {
    const workspaceId = activeWorkspaceId;
    const created: Workbook = {
      id: `wb_${Math.random().toString(36).slice(2, 8)}`,
      name: input.name,
      kind: "workbook",
      ownerId: currentUser.id,
      updatedAt: new Date().toISOString(),
      views: 0,
      folder: input.folder,
      query: input.query,
    };
    setSlice(workspaceId, { workbooks: [created, ...getSlice(workspaceId).workbooks] });
    return wait(created);
  },
  async deleteWorkbook(workbookId) {
    const workspaceId = activeWorkspaceId;
    setSlice(workspaceId, { workbooks: getSlice(workspaceId).workbooks.filter((w) => w.id !== workbookId) });
    return wait(undefined);
  },
  async recordWorkbookView(workbookId) {
    const workspaceId = activeWorkspaceId;
    const slice = getSlice(workspaceId);
    // The id could be either kind, each stored (and counted) in its own
    // place — an exploration's own record, or the report it actually
    // belongs to (see reportToWorkbook: a report has no separate stored
    // card of its own to increment). Silently a no-op for neither, rather
    // than throwing — a view "landing nowhere" isn't a caller error.
    if (slice.workbooks.some((w) => w.id === workbookId)) {
      setSlice(workspaceId, {
        workbooks: slice.workbooks.map((w) => (w.id === workbookId ? { ...w, views: w.views + 1 } : w)),
      });
    } else if (slice.reports.some((r) => r.id === workbookId)) {
      setSlice(workspaceId, {
        reports: slice.reports.map((r) => (r.id === workbookId ? { ...r, views: r.views + 1 } : r)),
      });
    }
    return wait(undefined);
  },
  async listReports() {
    return wait(getSlice(activeWorkspaceId).reports);
  },
  async getReport(reportId) {
    const report = getSlice(activeWorkspaceId).reports.find((r) => r.id === reportId);
    if (!report) throw new ApiError(`Report "${reportId}" not found`, 404);
    return wait(report);
  },
  async createReport(input: CreateReportInput) {
    const workspaceId = activeWorkspaceId;
    const created: Report = {
      id: `rpt_${Math.random().toString(36).slice(2, 8)}`,
      workspaceId,
      name: input.name,
      description: input.description,
      folder: input.folder,
      blocks: [],
      ownerId: currentUser.id,
      updatedAt: new Date().toISOString(),
      views: 0,
    };
    setSlice(workspaceId, { reports: [created, ...getSlice(workspaceId).reports] });
    return wait(created);
  },
  async updateReport(reportId, input: UpdateReportInput) {
    const workspaceId = activeWorkspaceId;
    let updated: Report | undefined;
    const reports = getSlice(workspaceId).reports.map((r) => {
      if (r.id !== reportId) return r;
      updated = {
        ...r,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.blocks !== undefined ? { blocks: input.blocks } : {}),
        updatedAt: new Date().toISOString(),
      };
      return updated;
    });
    if (!updated) throw new ApiError(`Report "${reportId}" not found`, 404);
    setSlice(workspaceId, { reports });
    return wait(updated);
  },
  async deleteReport(reportId) {
    const workspaceId = activeWorkspaceId;
    setSlice(workspaceId, { reports: getSlice(workspaceId).reports.filter((r) => r.id !== reportId) });
    return wait(undefined);
  },

  async listExperiments() {
    return wait(getSlice(activeWorkspaceId).experiments);
  },
  async getExperiment(experimentId) {
    const experiment = getSlice(activeWorkspaceId).experiments.find((e) => e.id === experimentId);
    if (!experiment) throw new ApiError(`Experiment "${experimentId}" not found`, 404);
    return wait(experiment);
  },
  async createExperiment(input: CreateExperimentInput) {
    const workspaceId = activeWorkspaceId;
    const created: Experiment = {
      id: `exp_${Math.random().toString(36).slice(2, 9)}`,
      workspaceId,
      name: input.name,
      hypothesis: input.hypothesis,
      metricId: input.metricId,
      unitType: input.unitType,
      treatment: { units: input.treatment.units, share: 0.5 },
      holdout: { units: input.holdout.units, share: 0.5 },
      startDate: input.startDate,
      endDate: input.endDate,
      status: "draft",
      ownerId: currentUser.id,
      createdAt: new Date().toISOString(),
    };
    setSlice(workspaceId, { experiments: [created, ...getSlice(workspaceId).experiments] });
    return wait(created);
  },
  async updateExperiment(experimentId, input: UpdateExperimentInput) {
    const workspaceId = activeWorkspaceId;
    let updated: Experiment | undefined;
    const experiments = getSlice(workspaceId).experiments.map((e) => {
      if (e.id !== experimentId) return e;
      updated = {
        ...e,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.hypothesis !== undefined ? { hypothesis: input.hypothesis } : {}),
        ...(input.metricId !== undefined ? { metricId: input.metricId } : {}),
        ...(input.unitType !== undefined ? { unitType: input.unitType } : {}),
        ...(input.treatment !== undefined ? { treatment: { ...e.treatment, units: input.treatment.units } } : {}),
        ...(input.holdout !== undefined ? { holdout: { ...e.holdout, units: input.holdout.units } } : {}),
        ...(input.startDate !== undefined ? { startDate: input.startDate } : {}),
        ...(input.endDate !== undefined ? { endDate: input.endDate } : {}),
      };
      return updated;
    });
    if (!updated) throw new ApiError(`Experiment "${experimentId}" not found`, 404);
    setSlice(workspaceId, { experiments });
    return wait(updated);
  },
  async deleteExperiment(experimentId) {
    const workspaceId = activeWorkspaceId;
    setSlice(workspaceId, { experiments: getSlice(workspaceId).experiments.filter((e) => e.id !== experimentId) });
    return wait(undefined);
  },
};
