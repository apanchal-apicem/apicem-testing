import type { QueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { queryKeys } from "@/api/hooks";
import {
  preloadConnectSourcePage,
  preloadConnectionsPage,
  preloadExperimentsListPage,
  preloadExplorePage,
  preloadReportsListPage,
  preloadSettingsPage,
} from "@/route-preload";

/**
 * Warms both the JS chunk and the first data a destination route needs, on
 * hover/focus of a link to it — by the time the click lands, there's nothing
 * left to wait on. Safe to call repeatedly: `import()` and `prefetchQuery`
 * are both no-ops once the chunk/data are already cached.
 */
export function prefetchRoute(path: string, queryClient: QueryClient) {
  if (path === "/explore") {
    preloadExplorePage();
    queryClient.prefetchQuery({ queryKey: queryKeys.metrics, queryFn: apiClient.listMetrics });
    queryClient.prefetchQuery({ queryKey: queryKeys.starterQuestions, queryFn: apiClient.listStarterQuestions });
    return;
  }
  if (path === "/experiments") {
    preloadExperimentsListPage();
    queryClient.prefetchQuery({ queryKey: queryKeys.experiments, queryFn: apiClient.listExperiments });
    return;
  }
  if (path === "/reports") {
    preloadReportsListPage();
    queryClient.prefetchQuery({ queryKey: queryKeys.reports, queryFn: apiClient.listReports });
    return;
  }
  if (path === "/connections") {
    preloadConnectionsPage();
    queryClient.prefetchQuery({ queryKey: queryKeys.dataSources, queryFn: apiClient.listDataSources });
    return;
  }
  if (path === "/connections/new") {
    preloadConnectSourcePage();
    return;
  }
  if (path === "/settings") {
    preloadSettingsPage();
    queryClient.prefetchQuery({ queryKey: queryKeys.workspace, queryFn: apiClient.getCurrentWorkspace });
    queryClient.prefetchQuery({ queryKey: queryKeys.members, queryFn: apiClient.listTeamMembers });
  }
}
