import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateDataSourceInput,
  CreateExperimentInput,
  CreateReportInput,
  CreateWorkbookInput,
  CreateWorkspaceInput,
  ReportBlock,
  RunPivotQueryInput,
  RunQueryInput,
  UpdateExperimentInput,
  UpdateReportInput,
} from "@apicem/api-contract";
import { apiClient } from "./client";
import { STALE_TIME, queryPersister } from "./query-client";

export const queryKeys = {
  me: ["me"] as const,
  workspace: ["workspace"] as const,
  myWorkspaces: ["my-workspaces"] as const,
  members: ["members"] as const,
  dataSources: ["data-sources"] as const,
  schema: (sourceId: string) => ["data-sources", sourceId, "schema"] as const,
  syncRuns: (sourceId: string) => ["data-sources", sourceId, "sync-runs"] as const,
  metrics: ["metrics"] as const,
  starterQuestions: ["starter-questions"] as const,
  workbooks: ["workbooks"] as const,
  workbook: (id: string) => ["workbooks", id] as const,
  reports: ["reports"] as const,
  report: (id: string) => ["reports", id] as const,
  experiments: ["experiments"] as const,
  experiment: (id: string) => ["experiments", id] as const,
};

export function useCurrentUser() {
  return useQuery({ queryKey: queryKeys.me, queryFn: apiClient.getCurrentUser });
}

export function useCurrentWorkspace() {
  return useQuery({ queryKey: queryKeys.workspace, queryFn: apiClient.getCurrentWorkspace });
}

export function useTeamMembers() {
  return useQuery({ queryKey: queryKeys.members, queryFn: apiClient.listTeamMembers });
}

export function useMyWorkspaces() {
  return useQuery({ queryKey: queryKeys.myWorkspaces, queryFn: apiClient.listMyWorkspaces });
}

/**
 * Every cached query except the workspace list itself is scoped to whichever
 * workspace was active when it was fetched — even `me`'s role field depends
 * on it. Rather than enumerate and invalidate each one, clear the whole
 * cache: the one moment this matters for real is exactly the moment it'd be
 * riskiest to get a filter wrong.
 *
 * `qc.clear()` alone isn't enough, though: the persisted localStorage
 * snapshot is written on a throttle (see query-client.ts), so a switch
 * immediately followed by a reload can race it — the reload restores the
 * *previous* workspace's still-on-disk snapshot before the throttle ever
 * flushes the cleared state, and that stale data reads as fresh for its
 * remaining staleTime. Removing the persisted snapshot synchronously here
 * closes that window: a reload right after switching finds nothing to
 * restore, and fetches cold against whichever workspace is now active,
 * rather than ever risking painting one workspace's cached data under
 * another's screen.
 */
async function clearWorkspaceScopedCache(qc: ReturnType<typeof useQueryClient>) {
  qc.clear();
  await queryPersister.removeClient();
}

export function useSwitchWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workspaceId: string) => apiClient.switchWorkspace(workspaceId),
    onSuccess: () => clearWorkspaceScopedCache(qc),
  });
}

export function useCreateWorkspace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkspaceInput) => apiClient.createWorkspace(input),
    // Creating a workspace also switches into it (see the mock and the real
    // adapter's contract) — same reasoning as useSwitchWorkspace above.
    onSuccess: () => clearWorkspaceScopedCache(qc),
  });
}

export function useDataSources() {
  // LIVE tier: sync status can change from a background job the current
  // user didn't trigger — see STALE_TIME's doc comment.
  return useQuery({ queryKey: queryKeys.dataSources, queryFn: apiClient.listDataSources, staleTime: STALE_TIME.LIVE });
}

export function useDataSourceSchema(sourceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.schema(sourceId ?? ""),
    queryFn: () => apiClient.getDataSourceSchema(sourceId!),
    enabled: Boolean(sourceId),
  });
}

export function useCreateDataSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDataSourceInput) => apiClient.createDataSource(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.dataSources }),
  });
}

export function useRemoveDataSource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sourceId: string) => apiClient.removeDataSource(sourceId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.dataSources }),
  });
}

export function useSyncRuns(sourceId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.syncRuns(sourceId ?? ""),
    queryFn: () => apiClient.listSyncRuns(sourceId!),
    enabled: Boolean(sourceId),
    staleTime: STALE_TIME.LIVE,
  });
}

export function useRetrySync(sourceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.retrySync(sourceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.syncRuns(sourceId) });
      qc.invalidateQueries({ queryKey: queryKeys.dataSources });
    },
  });
}

export function useMetrics() {
  return useQuery({ queryKey: queryKeys.metrics, queryFn: apiClient.listMetrics });
}

export function useStarterQuestions() {
  return useQuery({ queryKey: queryKeys.starterQuestions, queryFn: apiClient.listStarterQuestions });
}

export function useBlockData(source: "metric" | "preset" | undefined, key: string | undefined) {
  return useQuery({
    queryKey: ["block-data", source, key] as const,
    queryFn: () => apiClient.getBlockData(source!, key!),
    enabled: Boolean(source && key),
    // LIVE tier: a block's underlying metric can move when its source
    // re-syncs, same reasoning as useDataSources above.
    staleTime: STALE_TIME.LIVE,
  });
}

export function useRunQuery() {
  return useMutation({
    mutationFn: (input: RunQueryInput) => apiClient.runQuery(input),
  });
}

/** A pivot report block's live data — a query, not the mutation Explore's own Pivot tab uses, so a saved block auto-fetches and caches the same way any other block's useBlockData does, instead of needing something to dispatch a "run" on mount. */
export function usePivotBlockData(metricIds: string[], rowDimensions: string[], columnDimensions: string[]) {
  return useQuery({
    queryKey: ["pivot-block-data", metricIds, rowDimensions, columnDimensions] as const,
    queryFn: () => apiClient.runPivotQuery({ metricIds, rowDimensions, columnDimensions }),
    staleTime: STALE_TIME.LIVE,
  });
}

export function useRunPivotQuery() {
  return useMutation({
    mutationFn: (input: RunPivotQueryInput) => apiClient.runPivotQuery(input),
  });
}

export function useWorkbooks() {
  return useQuery({ queryKey: queryKeys.workbooks, queryFn: apiClient.listWorkbooks });
}

export function useWorkbook(workbookId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.workbook(workbookId ?? ""),
    queryFn: () => apiClient.getWorkbook(workbookId!),
    enabled: Boolean(workbookId),
  });
}

export function useCreateWorkbook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkbookInput) => apiClient.createWorkbook(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workbooks }),
  });
}

export function useDeleteWorkbook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workbookId: string) => apiClient.deleteWorkbook(workbookId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workbooks }),
  });
}

/**
 * Fire-and-forget: a page that displays a report or exploration calls this
 * once, and doesn't otherwise care whether or when it resolves. Invalidates
 * the Home-page list so its view count is correct next time that list is
 * fetched, without needing this page to know or care that Home exists.
 */
export function useRecordWorkbookView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (workbookId: string) => apiClient.recordWorkbookView(workbookId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.workbooks }),
  });
}

/**
 * Records exactly one view per distinct `id`, from whichever page renders
 * this — not once per render or re-fetch. A plain `useEffect(() => record(),
 * [id])` isn't actually once: StrictMode deliberately double-invokes effects
 * in development to catch exactly this class of non-idempotent effect, and
 * a real remount (a Suspense retry, an error boundary recovering) would
 * double it in production too. The ref survives both without resetting,
 * since neither actually unmounts the component the way a key change would.
 */
export function useRecordWorkbookViewOnce(id: string | undefined) {
  const recordView = useRecordWorkbookView();
  const recordedRef = useRef<string | null>(null);
  useEffect(() => {
    if (id && recordedRef.current !== id) {
      recordedRef.current = id;
      recordView.mutate(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
}

export function useReports() {
  return useQuery({ queryKey: queryKeys.reports, queryFn: apiClient.listReports });
}

export function useReport(reportId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.report(reportId ?? ""),
    queryFn: () => apiClient.getReport(reportId!),
    enabled: Boolean(reportId),
  });
}

export function useCreateReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReportInput) => apiClient.createReport(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.reports }),
  });
}

export function useUpdateReport(reportId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateReportInput) => apiClient.updateReport(reportId, input),
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.report(reportId), updated);
      qc.invalidateQueries({ queryKey: queryKeys.reports });
    },
  });
}

/** Appends one block to a report, auto-placed below whatever's already there. Used by "Add to report" flows outside the builder itself. */
export function useAppendReportBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ reportId, block }: { reportId: string; block: Omit<ReportBlock, "layout"> & { layout?: Partial<ReportBlock["layout"]> } }) => {
      const report = await apiClient.getReport(reportId);
      const maxY = report.blocks.reduce((acc, b) => Math.max(acc, b.layout.y + b.layout.h), 0);
      const layout: ReportBlock["layout"] = {
        x: 0,
        y: maxY,
        w: 6,
        h: 4,
        ...block.layout,
      };
      const nextBlocks: ReportBlock[] = [...report.blocks, { ...block, layout }];
      return apiClient.updateReport(reportId, { blocks: nextBlocks });
    },
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.report(updated.id), updated);
      qc.invalidateQueries({ queryKey: queryKeys.reports });
    },
  });
}

export function useDeleteReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reportId: string) => apiClient.deleteReport(reportId),
    // A report's Home-page card is derived live from the report itself (see
    // Workbook.kind's doc comment), not a second stored row — invalidating
    // only queryKeys.reports would leave that stale, still-there card
    // showing on Home until something else happened to refetch it.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.reports });
      qc.invalidateQueries({ queryKey: queryKeys.workbooks });
    },
  });
}

export function useExperiments() {
  return useQuery({ queryKey: queryKeys.experiments, queryFn: apiClient.listExperiments });
}

export function useExperiment(experimentId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.experiment(experimentId ?? ""),
    queryFn: () => apiClient.getExperiment(experimentId!),
    enabled: Boolean(experimentId),
  });
}

export function useCreateExperiment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExperimentInput) => apiClient.createExperiment(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.experiments }),
  });
}

export function useUpdateExperiment(experimentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateExperimentInput) => apiClient.updateExperiment(experimentId, input),
    onSuccess: (updated) => {
      qc.setQueryData(queryKeys.experiment(experimentId), updated);
      qc.invalidateQueries({ queryKey: queryKeys.experiments });
    },
  });
}

export function useDeleteExperiment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (experimentId: string) => apiClient.deleteExperiment(experimentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.experiments }),
  });
}
