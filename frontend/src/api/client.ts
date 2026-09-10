// Derived from the page's own hostname rather than hardcoded to "localhost": a teammate
// loading this over the LAN (e.g. http://192.168.1.53:5173) has their OWN machine at
// "localhost", not the host running the backend -- hardcoding it would send every API call
// nowhere. Using the same host the browser actually loaded the page from works for both
// localhost and any LAN IP without per-teammate configuration.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || `http://${window.location.hostname}:8000`;

// Uploaded logos are served from the backend (main.py's /uploads static mount), not the
// frontend dev server -- a bare relative "/uploads/..." src would resolve against Vite's
// own origin and 404. Reuses the same dynamic-hostname base as every API call.
export function assetUrl(path: string): string {
  return `${API_BASE_URL}${path}`;
}

function getToken(): string | null {
  return localStorage.getItem("apicem_token");
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem("apicem_token", token);
  else localStorage.removeItem("apicem_token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    // A FormData body (logo upload) must NOT get a manually-set Content-Type -- the
    // browser needs to set its own multipart boundary, which a hardcoded
    // "application/json" would clobber.
    ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(body.detail || `Request failed: ${response.status}`);
  }
  if (response.status === 204 || response.status === 202) return {} as T;
  return response.json();
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface MeResponse {
  user_id: string;
  tenant_id: string;
  email: string;
  role: string;
  tenant_name: string;
  tenant_logo_url: string | null;
  is_demo: boolean;
}

export interface ConnectionOut {
  connection_id: string;
  source_type: string;
  status: string;
  use_mock_data: boolean;
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface JobRunOut {
  job_run_id: string;
  job_type: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
  records_synced: Record<string, number> | null;
}

export interface DashboardWidget {
  type: string;
  metric: string;
  label: string;
  value?: number | null;
  previous_value?: number | null;
  delta_pct?: number | null;
  is_estimated: boolean;
  series?: { date_key: string; gross_revenue: number; net_revenue: number }[] | null;
  rows?: Record<string, string | number>[] | null;
}

export interface DashboardOut {
  id: string;
  title: string;
  date_note: string;
  widgets: DashboardWidget[];
}

export interface TeamMemberOut {
  user_id: string;
  email: string;
  role: string;
  created_at: string;
}

export interface AssistantMetricResult {
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
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Only ever set on an assistant message, and only when it looked something up --
   * lets the chat render the same KpiTile/TrendChart/MetricTable a dashboard would. */
  results?: AssistantMetricResult[];
}

export interface AssistantMessageOut {
  message_id: string;
  role: "user" | "assistant";
  content: string;
  results: AssistantMetricResult[];
  created_at: string;
}

export interface AssistantCapabilityMetric {
  key: string;
  label: string;
  kind: "number" | "trend" | "table";
}

export interface AssistantCapabilityCategory {
  category: string;
  metrics: AssistantCapabilityMetric[];
}

export const api = {
  signup: (payload: { company_name: string; email: string; password: string }) =>
    request<TokenResponse>("/auth/signup", { method: "POST", body: JSON.stringify(payload) }),
  login: (payload: { email: string; password: string }) =>
    request<TokenResponse>("/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  demoLogin: () => request<TokenResponse>("/auth/demo", { method: "POST" }),
  requestPasswordReset: (email: string) =>
    request<{ status: string }>("/auth/request-password-reset", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, newPassword: string) =>
    request<void>("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, new_password: newPassword }),
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    }),
  me: () => request<MeResponse>("/auth/me"),
  listConnections: () => request<ConnectionOut[]>("/connections"),
  createConnection: (payload: {
    source_type: string;
    use_mock_data: boolean;
    credentials?: Record<string, string>;
  }) => request<ConnectionOut>("/connections", { method: "POST", body: JSON.stringify(payload) }),
  connectionJobRuns: (connectionId: string) =>
    request<JobRunOut[]>(`/connections/${connectionId}/job_runs`),
  deleteConnection: (connectionId: string) =>
    request<void>(`/connections/${connectionId}`, { method: "DELETE" }),
  syncNow: (connectionId: string) =>
    request<{ status: string }>(`/connections/${connectionId}/sync-now`, { method: "POST" }),
  listDashboards: () => request<DashboardOut[]>("/dashboards"),
  getDashboard: (id: string, dateParams?: { start_date?: string; end_date?: string }) => {
    const query = new URLSearchParams();
    if (dateParams?.start_date) query.set("start_date", dateParams.start_date);
    if (dateParams?.end_date) query.set("end_date", dateParams.end_date);
    const qs = query.toString();
    return request<DashboardOut>(`/dashboards/${id}${qs ? `?${qs}` : ""}`);
  },
  listTeam: () => request<TeamMemberOut[]>("/team"),
  addTeammate: (payload: { email: string; password: string; role: string }) =>
    request<TeamMemberOut>("/team", { method: "POST", body: JSON.stringify(payload) }),
  removeTeammate: (userId: string) => request<void>(`/team/${userId}`, { method: "DELETE" }),
  askAssistant: (
    message: string,
    previousContext?: { metric: string; start_date: string; end_date: string }
  ) =>
    request<{ reply: string; results: AssistantMetricResult[] }>("/assistant/ask", {
      method: "POST",
      body: JSON.stringify({
        message,
        previous_metric: previousContext?.metric,
        previous_start_date: previousContext?.start_date,
        previous_end_date: previousContext?.end_date,
      }),
    }),
  assistantCapabilities: () =>
    request<AssistantCapabilityCategory[]>("/assistant/capabilities"),
  assistantHistory: () => request<AssistantMessageOut[]>("/assistant/history"),
  clearAssistantHistory: () => request<void>("/assistant/history", { method: "DELETE" }),
  updateTenant: (name: string) =>
    request<void>("/tenant", { method: "PATCH", body: JSON.stringify({ name }) }),
  uploadLogo: (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    return request<void>("/tenant/logo", { method: "POST", body: formData });
  },
  removeLogo: () => request<void>("/tenant/logo", { method: "DELETE" }),
};
