import type {
  CreateDataSourceInput,
  CreateExperimentInput,
  CreateReportInput,
  CreateWorkbookInput,
  CreateWorkspaceInput,
  DataSourceStatus,
  DataSourceType,
  Metric,
  QueryResult,
  Role,
  RunPivotQueryInput,
  RunQueryInput,
  StarterQuestion,
  UpdateExperimentInput,
  UpdateReportInput,
  Workspace,
  WorkspaceSummary,
} from "@apicem/api-contract";
import type { ApiClient } from "../types";
import { ApiError } from "../types";
import { mockClient } from "../mock/adapter";
import { getSchemaPreviewForType } from "../mock/fixtures";
import axios, { type AxiosRequestConfig } from "axios";

/**
 * Adapter that connects new_frontend directly to backend-node routes:
 *   POST   /auth/signup                    -> { access_token, token_type }
 *   POST   /auth/login                     -> { access_token, token_type }
 *   GET    /auth/me                        -> { user_id, tenant_id, email, role, tenant_name, tenant_logo_url }
 *   POST   /auth/change-password            -> 204
 *   POST   /auth/request-password-reset     -> 202
 *   PATCH  /tenant                         -> 204
 *   GET    /team                           -> { user_id, email, role, created_at }[]
 *   PATCH  /team/:userId                   -> 204
 *   DELETE /team/:userId                   -> 204
 *   GET    /connections                    -> connection rows
 *   POST   /connections                    -> connection row
 *   DELETE /connections/:connectionId      -> 204
 *   GET    /connections/:id/job_runs       -> job run rows
 *   POST   /connections/:id/sync-now       -> 202 { status: "sync_requested" }
 *   GET    /metrics                        -> { scalar, series, table }
 *   GET    /metrics/:metricKey             -> calculated metric result
 *
 * For features not yet present in backend-node (Workbooks, Reports, Experiments),
 * this adapter delegates to mock storage so the frontend remains functional and stable.
 */

const TOKEN_KEY = "apicem_access_token";

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {}
}

const RAW_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
// Strip any trailing /api/v1 so requests target the root routes of backend-node
const BASE_URL = RAW_BASE_URL.replace(/\/api\/v1\/?$/, "");

const http = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

http.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    if (config.headers && typeof config.headers.set === "function") {
      config.headers.set("Authorization", `Bearer ${token}`);
    } else {
      config.headers = config.headers || {};
      (config.headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
    }
  }
  return config;
});

async function request<T>(
  path: string,
  config?: AxiosRequestConfig,
): Promise<T> {
  try {
    const response = await http.request<T>({ ...config, url: path });
    if (response.status === 204) return undefined as T;
    return response.data;
  } catch (error) {
    if (!axios.isAxiosError(error)) throw error;
    if (error.response?.status === 401) {
      setStoredToken(null);
    }
    const body = error.response?.data as
      | { detail?: unknown }
      | string
      | undefined;
    const message =
      typeof body === "string"
        ? body
        : typeof body?.detail === "string"
          ? body.detail
          : error.message || `Request to ${path} failed`;
    throw new ApiError(message, error.response?.status ?? 0);
  }
}

const AVATAR_PALETTE = [
  "#3b5f8a",
  "#5f7a8f",
  "#6e6656",
  "#7a8f6d",
  "#8f6d5f",
  "#a15a3f",
];

function pickAvatarColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const idx = Math.abs(hash) % AVATAR_PALETTE.length;
  return AVATAR_PALETTE[idx];
}

interface AuthMeResponse {
  user_id: string;
  tenant_id: string;
  email: string;
  name?: string | null;
  role: string;
  tenant_name: string;
  tenant_logo_url: string | null;
  is_demo?: boolean;
}

interface TeamMemberRow {
  user_id: string;
  email: string;
  name?: string | null;
  role: string;
  created_at: string;
}

interface ConnectionRow {
  connection_id: string;
  source_type: string;
  display_name?: string;
  status: string;
  use_mock_data: boolean;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
}

interface JobRunRow {
  job_run_id: string;
  job_type: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
  records_synced: unknown;
}

function parseRecordsSynced(val: unknown): number {
  if (typeof val === "number") return val;
  if (val && typeof val === "object") {
    return Object.values(val as Record<string, unknown>).reduce<number>((sum, item) => {
      return sum + (typeof item === "number" ? item : 0);
    }, 0);
  }
  return 0;
}

export const realClient: ApiClient = {
  signUp: async (companyName, email, password) => {
    const res = await request<{ access_token: string }>("/auth/signup", {
      method: "POST",
      data: { company_name: companyName, email, password },
    });
    if (res?.access_token) {
      setStoredToken(res.access_token);
    }
  },

  signIn: async (email, password) => {
    const res = await request<{ access_token: string }>("/auth/login", {
      method: "POST",
      data: { email, password },
    });
    if (res?.access_token) {
      setStoredToken(res.access_token);
    }
  },

  signOut: async () => {
    try {
      await request<void>("/auth/logout", { method: "POST" });
    } catch {}
    setStoredToken(null);
  },

  requestPasswordReset: (email) =>
    request<void>("/auth/request-password-reset", {
      method: "POST",
      data: { email },
    }),

  changePassword: (currentPassword, newPassword) =>
    request<void>("/auth/change-password", {
      method: "POST",
      data: { current_password: currentPassword, new_password: newPassword },
    }),

  getCurrentUser: async () => {
    const res = await request<AuthMeResponse>("/auth/me");
    return {
      id: res.user_id,
      name: res.name?.trim() || res.email.split("@")[0],
      email: res.email,
      role: res.role as Role,
      avatarColor: pickAvatarColor(res.user_id),
    };
  },

  getCurrentWorkspace: async () => {
    const res = await request<AuthMeResponse>("/auth/me");
    return {
      id: res.tenant_id,
      name: res.tenant_name,
      slug: res.tenant_name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      plan: "growth",
      memberCount: 1,
    };
  },

  updateProfile: async (name) => {
    await request<void>("/auth/me", {
      method: "PATCH",
      data: { name },
    });
    return realClient.getCurrentUser();
  },

  updateWorkspace: async (name) => {
    await request<void>("/tenant", {
      method: "PATCH",
      data: { name },
    });
    return realClient.getCurrentWorkspace();
  },

  listTeamMembers: async () => {
    const rows = await request<TeamMemberRow[]>("/team");
    return rows.map((r) => ({
      id: r.user_id,
      name: r.name?.trim() || r.email.split("@")[0],
      email: r.email,
      role: r.role as Role,
      avatarColor: pickAvatarColor(r.user_id),
    }));
  },

  updateMemberRole: (userId, role) =>
    request<void>(`/team/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      data: { role },
    }),

  addTeamMember: async (input) => {
    const res = await request<{ user_id: string; email: string; role: Role; name?: string }>("/team", {
      method: "POST",
      data: {
        email: input.email,
        password: input.password,
        role: input.role ?? "viewer",
      },
    });
    return {
      id: res.user_id,
      name: res.name?.trim() || res.email.split("@")[0],
      email: res.email,
      role: res.role,
      avatarColor: pickAvatarColor(res.user_id),
    };
  },

  removeTeamMember: (userId) =>
    request<void>(`/team/${encodeURIComponent(userId)}`, {
      method: "DELETE",
    }),

  listMyWorkspaces: async () => {
    try {
      const rows = await request<WorkspaceSummary[]>("/workspaces");
      if (Array.isArray(rows) && rows.length > 0) {
        return rows;
      }
    } catch {}
    const ws = await realClient.getCurrentWorkspace();
    const user = await realClient.getCurrentUser();
    return [
      {
        id: ws.id,
        name: ws.name,
        slug: ws.slug,
        plan: ws.plan,
        myRole: user.role,
      },
    ];
  },

  switchWorkspace: async (workspaceId: string) => {
    const res = await request<{ access_token: string; workspace: Workspace }>(
      `/workspaces/${encodeURIComponent(workspaceId)}/switch`,
      { method: "POST" },
    );
    if (res.access_token) {
      setStoredToken(res.access_token);
    }
    return res.workspace;
  },

  createWorkspace: async (input: CreateWorkspaceInput) => {
    const res = await request<{ access_token: string; workspace: Workspace }>(
      "/workspaces",
      { method: "POST", data: { name: input.name } },
    );
    if (res.access_token) {
      setStoredToken(res.access_token);
    }
    return res.workspace;
  },

  listDataSources: async () => {
    const rows = await request<ConnectionRow[]>("/connections");
    const ws = await realClient.getCurrentWorkspace();
    return rows.map((c) => ({
      id: c.connection_id,
      workspaceId: ws.id,
      type: (c.source_type ?? "shopify") as DataSourceType,
      name:
        c.display_name ||
        c.source_type.charAt(0).toUpperCase() + c.source_type.slice(1),
      status: (c.status === "ready" || c.status === "active"
        ? "connected"
        : c.status === "pending"
          ? "pending"
          : c.last_error
            ? "error"
            : "connected") as DataSourceStatus,
      lastSyncedAt: c.last_synced_at,
      tableCount: 1,
      rowCount: 100,
      errorMessage: c.last_error ?? undefined,
    }));
  },

  getDataSourceSchema: async (sourceId) => {
    try {
      const rows = await request<ConnectionRow[]>("/connections");
      const found = rows.find((r) => r.connection_id === sourceId);
      const type = found?.source_type ?? "shopify";
      return {
        sourceId,
        tables: getSchemaPreviewForType(type),
      };
    } catch {
      return {
        sourceId,
        tables: getSchemaPreviewForType("shopify"),
      };
    }
  },

  createDataSource: async (input: CreateDataSourceInput) => {
    const row = await request<ConnectionRow>("/connections", {
      method: "POST",
      data: {
        source_type: input.type,
        name: input.name,
        display_name: input.name,
        use_mock_data: true,
        credentials: input.credentials,
      },
    });
    const ws = await realClient.getCurrentWorkspace();
    return {
      id: row.connection_id,
      workspaceId: ws.id,
      type: (row.source_type ?? "shopify") as DataSourceType,
      name:
        row.display_name ||
        input.name ||
        row.source_type.charAt(0).toUpperCase() + row.source_type.slice(1),
      status: (row.status === "ready" || row.status === "active"
        ? "connected"
        : row.status) as DataSourceStatus,
      lastSyncedAt: row.last_synced_at,
      tableCount: 1,
      rowCount: 0,
      errorMessage: row.last_error ?? undefined,
    };
  },

  removeDataSource: (sourceId) =>
    request<void>(`/connections/${encodeURIComponent(sourceId)}`, {
      method: "DELETE",
    }),

  listSyncRuns: async (sourceId) => {
    const rows = await request<JobRunRow[]>(
      `/connections/${encodeURIComponent(sourceId)}/job_runs`,
    );
    return rows.map((r) => ({
      id: r.job_run_id,
      sourceId,
      idempotencyKey: r.job_run_id,
      attempt: 1,
      status:
        r.status === "success" || r.status === "completed"
          ? "success"
          : r.status === "failed" || r.status === "error"
            ? "failed"
            : "running",
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      rowsUpserted: parseRecordsSynced(r.records_synced),
      errorMessage: r.error_message ?? undefined,
    }));
  },

  retrySync: async (sourceId) => {
    await request<void>(
      `/connections/${encodeURIComponent(sourceId)}/sync-now`,
      { method: "POST" },
    );
    return {
      id: crypto.randomUUID(),
      sourceId,
      idempotencyKey: crypto.randomUUID(),
      attempt: 1,
      status: "running",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      rowsUpserted: 0,
    };
  },

  listMetrics: async () => {
    const res = await request<{
      scalar: Record<string, string>;
      series: Record<string, string>;
      table: Record<string, string>;
    }>("/metrics");
    const metrics: Metric[] = [];
    for (const [key, label] of Object.entries(res.scalar ?? {})) {
      metrics.push({
        id: key,
        name: label,
        description: label,
        category: "revenue",
        format: "currency",
        sourceIds: [],
      });
    }
    for (const [key, label] of Object.entries(res.series ?? {})) {
      metrics.push({
        id: key,
        name: label,
        description: label,
        category: "growth",
        format: "number",
        sourceIds: [],
      });
    }
    for (const [key, label] of Object.entries(res.table ?? {})) {
      metrics.push({
        id: key,
        name: label,
        description: label,
        category: "marketing",
        format: "number",
        sourceIds: [],
      });
    }
    return metrics;
  },

  listStarterQuestions: async () => {
    try {
      const categories = await request<
        { category: string; metrics: { key: string; label: string; kind: string }[] }[]
      >("/assistant/capabilities");
      if (Array.isArray(categories) && categories.length > 0) {
        const questions: StarterQuestion[] = [];
        for (const cat of categories) {
          for (const m of cat.metrics) {
            questions.push({
              id: `starter_${m.key}`,
              question:
                m.kind === "trend"
                  ? `Show me ${m.label.toLowerCase()} over the last 12 weeks`
                  : m.kind === "table"
                    ? `Show me ${m.label.toLowerCase()} for the last 30 days`
                    : `What was our ${m.label.toLowerCase()} in the last 90 days?`,
              hint: cat.category,
              category: cat.category,
              suggestedMetricId: m.key,
            });
          }
        }
        if (questions.length > 0) return questions;
      }
    } catch {}
    return mockClient.listStarterQuestions();
  },

  runQuery: async (input: RunQueryInput): Promise<QueryResult> => {
    // 1. Natural language question -> POST /assistant/ask
    if (input.question && input.question.trim()) {
      try {
        const data = await request<{
          reply: string;
          results?: {
            metric: string;
            label: string;
            value?: number | null;
            previous_value?: number | null;
            delta_pct?: number | null;
            is_estimated: boolean;
            series?: Record<string, string | number>[] | null;
            rows?: Record<string, string | number>[] | null;
            start_date: string;
            end_date: string;
          }[];
        }>("/assistant/ask", {
          method: "POST",
          data: { message: input.question.trim() },
        });

        if (data && typeof data.reply === "string") {
          const first = data.results?.[0];
          if (first) {
            if (first.series && first.series.length > 0) {
              const sample = first.series[0];
              const columns = Object.keys(sample).map((key) => ({
                key,
                label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                type: (key.toLowerCase().includes("date") ? "date" : typeof sample[key] === "number" ? "number" : "string") as
                  | "date"
                  | "number"
                  | "string",
              }));
              return {
                columns,
                rows: first.series,
                chartSuggestion: "line",
                confidence: 0.95,
                summary: data.reply,
                resolvedKey: first.metric,
              };
            }

            if (first.rows && first.rows.length > 0) {
              const sample = first.rows[0];
              const columns = Object.keys(sample).map((key) => ({
                key,
                label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                type: (typeof sample[key] === "number" ? "number" : "string") as "number" | "string",
              }));
              return {
                columns,
                rows: first.rows,
                chartSuggestion: "table",
                confidence: 0.95,
                summary: data.reply,
                resolvedKey: first.metric,
              };
            }

            if (first.value !== undefined && first.value !== null) {
              return {
                columns: [
                  { key: "metric", label: "Metric", type: "string" },
                  { key: "value", label: "Value", type: "number" },
                ],
                rows: [{ metric: first.label || first.metric, value: first.value }],
                chartSuggestion: "kpi",
                confidence: 0.95,
                summary: data.reply,
                resolvedKey: first.metric,
              };
            }
          }

          return {
            columns: [{ key: "answer", label: "Answer", type: "string" }],
            rows: [{ answer: data.reply }],
            chartSuggestion: "kpi",
            confidence: 0.85,
            summary: data.reply,
          };
        }
      } catch (err) {
        console.warn("Backend /assistant/ask call failed, falling back to local resolver:", err);
      }
    }

    // 2. Metric manual / ad-hoc query -> POST /query
    if (input.metricIds && input.metricIds.length > 0) {
      try {
        const queryRes = await request<QueryResult>("/query", {
          method: "POST",
          data: {
            metricIds: input.metricIds,
            dimensions: input.dimensions,
            filters: input.filters,
            startDate: input.startDate,
            endDate: input.endDate,
          },
        });
        if (queryRes && Array.isArray(queryRes.columns) && Array.isArray(queryRes.rows)) {
          return queryRes;
        }
      } catch (err) {
        console.warn("Backend /query call failed, trying metric fallback:", err);
      }

      // Fallback: single metric lookup -> GET /metrics/:metricId
      const metricId = input.metricIds[0];
      try {
        const data = await request<Record<string, unknown>>(
          `/metrics/${encodeURIComponent(metricId)}`,
        );
        if (data && typeof data === "object") {
          const label = (data.label as string) ?? metricId;
          if (Array.isArray(data.series) && data.series.length > 0) {
            const sample = data.series[0] as Record<string, unknown>;
            return {
              columns: Object.keys(sample).map((k) => ({
                key: k,
                label: k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                type: (k.toLowerCase().includes("date") ? "date" : typeof sample[k] === "number" ? "number" : "string") as any,
              })),
              rows: data.series as any,
              chartSuggestion: "line",
              confidence: 0.95,
              summary: `${label} trend directly from engine.`,
              resolvedKey: metricId,
            };
          }

          if (Array.isArray(data.rows) && data.rows.length > 0) {
            const sample = data.rows[0] as Record<string, unknown>;
            return {
              columns: Object.keys(sample).map((k) => ({
                key: k,
                label: k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                type: (typeof sample[k] === "number" ? "number" : "string") as any,
              })),
              rows: data.rows as any,
              chartSuggestion: "table",
              confidence: 0.95,
              summary: `${label} breakdown directly from engine.`,
              resolvedKey: metricId,
            };
          }

          return {
            columns: [
              { key: "metric", label: "Metric", type: "string" },
              { key: "value", label: "Value", type: "number" },
            ],
            rows: [{ metric: label, value: (data.value as number) ?? 0 }],
            chartSuggestion: "kpi",
            confidence: 0.95,
            summary: `Calculated ${label} directly from engine.`,
            resolvedKey: metricId,
          };
        }
      } catch {}
    }

    return mockClient.runQuery(input);
  },

  getBlockData: async (source, key): Promise<QueryResult> => {
    if (source === "metric") {
      try {
        const data = await request<Record<string, unknown>>(
          `/metrics/${encodeURIComponent(key)}`,
        );
        if (data && typeof data === "object") {
          const label = (data.label as string) ?? key;
          if (Array.isArray(data.series) && data.series.length > 0) {
            const sample = data.series[0] as Record<string, unknown>;
            return {
              columns: Object.keys(sample).map((k) => ({
                key: k,
                label: k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                type: (k.toLowerCase().includes("date") ? "date" : typeof sample[k] === "number" ? "number" : "string") as any,
              })),
              rows: data.series as any,
              chartSuggestion: "line",
              confidence: 0.95,
              summary: `Trend data for ${label}`,
              resolvedKey: key,
            };
          }

          if (Array.isArray(data.rows) && data.rows.length > 0) {
            const sample = data.rows[0] as Record<string, unknown>;
            return {
              columns: Object.keys(sample).map((k) => ({
                key: k,
                label: k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
                type: (typeof sample[k] === "number" ? "number" : "string") as any,
              })),
              rows: data.rows as any,
              chartSuggestion: "table",
              confidence: 0.95,
              summary: `Breakdown data for ${label}`,
              resolvedKey: key,
            };
          }

          return {
            columns: [
              { key: "metric", label: "Metric", type: "string" },
              { key: "value", label: "Value", type: "number" },
            ],
            rows: [{ metric: label, value: (data.value as number) ?? 0 }],
            chartSuggestion: "kpi",
            confidence: 0.95,
            summary: `Metric data for ${label}`,
            resolvedKey: key,
          };
        }
      } catch {}
    }
    return mockClient.getBlockData(source, key);
  },

  runPivotQuery: (input: RunPivotQueryInput) => mockClient.runPivotQuery(input),

  listWorkbooks: () => mockClient.listWorkbooks(),
  getWorkbook: (workbookId) => mockClient.getWorkbook(workbookId),
  createWorkbook: (input: CreateWorkbookInput) => mockClient.createWorkbook(input),
  deleteWorkbook: (workbookId) => mockClient.deleteWorkbook(workbookId),
  recordWorkbookView: (workbookId) => mockClient.recordWorkbookView(workbookId),

  listReports: () => mockClient.listReports(),
  getReport: (reportId) => mockClient.getReport(reportId),
  createReport: (input: CreateReportInput) => mockClient.createReport(input),
  updateReport: (reportId, input: UpdateReportInput) =>
    mockClient.updateReport(reportId, input),
  deleteReport: (reportId) => mockClient.deleteReport(reportId),

  listExperiments: () => mockClient.listExperiments(),
  getExperiment: (experimentId) => mockClient.getExperiment(experimentId),
  createExperiment: (input: CreateExperimentInput) =>
    mockClient.createExperiment(input),
  updateExperiment: (experimentId, input: UpdateExperimentInput) =>
    mockClient.updateExperiment(experimentId, input),
  deleteExperiment: (experimentId) => mockClient.deleteExperiment(experimentId),
};
