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
  Role,
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

export interface AuthApi {
  signUp(companyName: string, email: string, password: string): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  updateProfile(name: string): Promise<User>;
  changePassword(currentPassword: string, newPassword: string): Promise<void>;
  getCurrentUser(): Promise<User>;
}

export interface WorkspaceApi {
  getCurrentWorkspace(): Promise<Workspace>;
  updateWorkspace(name: string): Promise<Workspace>;
  listMyWorkspaces(): Promise<WorkspaceSummary[]>;
  switchWorkspace(workspaceId: string): Promise<Workspace>;
  createWorkspace(input: CreateWorkspaceInput): Promise<Workspace>;
  listTeamMembers(): Promise<User[]>;
  addTeamMember(input: { email: string; password: string; role?: Role }): Promise<User>;
  removeTeamMember(userId: string): Promise<void>;
  updateMemberRole(userId: string, role: Role): Promise<void>;
}

export interface DataSourceApi {
  listDataSources(): Promise<DataSource[]>;
  getDataSourceSchema(sourceId: string): Promise<DatasetSchema>;
  createDataSource(input: CreateDataSourceInput): Promise<DataSource>;
  removeDataSource(sourceId: string): Promise<void>;
  listSyncRuns(sourceId: string): Promise<SyncRun[]>;
  retrySync(sourceId: string): Promise<SyncRun>;
}

export interface MetricsApi {
  listMetrics(): Promise<Metric[]>;
  listStarterQuestions(): Promise<StarterQuestion[]>;
}

export interface QueryEngineApi {
  runQuery(input: RunQueryInput): Promise<QueryResult>;
  getBlockData(source: "metric" | "preset", key: string): Promise<QueryResult>;
  runPivotQuery(input: RunPivotQueryInput): Promise<PivotResult>;
}

export interface WorkbookApi {
  listWorkbooks(): Promise<Workbook[]>;
  getWorkbook(workbookId: string): Promise<Workbook>;
  createWorkbook(input: CreateWorkbookInput): Promise<Workbook>;
  deleteWorkbook(workbookId: string): Promise<void>;
  recordWorkbookView(workbookId: string): Promise<void>;
}

export interface ReportApi {
  listReports(): Promise<Report[]>;
  getReport(reportId: string): Promise<Report>;
  createReport(input: CreateReportInput): Promise<Report>;
  updateReport(reportId: string, input: UpdateReportInput): Promise<Report>;
  deleteReport(reportId: string): Promise<void>;
}

export interface ExperimentApi {
  listExperiments(): Promise<Experiment[]>;
  getExperiment(experimentId: string): Promise<Experiment>;
  createExperiment(input: CreateExperimentInput): Promise<Experiment>;
  updateExperiment(
    experimentId: string,
    input: UpdateExperimentInput,
  ): Promise<Experiment>;
  deleteExperiment(experimentId: string): Promise<void>;
}

/**
 * The full surface the frontend needs from the backend. Both the mock and
 * real adapters implement this exact interface — every screen is written
 * against `apiClient` from `./client`, never against the mock or real
 * adapter directly.
 */
export interface ApiClient
  extends AuthApi,
    WorkspaceApi,
    DataSourceApi,
    MetricsApi,
    QueryEngineApi,
    WorkbookApi,
    ReportApi,
    ExperimentApi {}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}
