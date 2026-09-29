/**
 * One `import()` call per lazy route, named so both `React.lazy()` in
 * routes.tsx and the hover-prefetch wiring in the sidebar reference the exact
 * same dynamic import — Vite dedupes on the literal specifier, so calling a
 * preloader on hover warms the same chunk `React.lazy` will ask for on
 * navigation. By the time the click lands, the chunk is already resolved.
 */
export const preloadExplorePage = () => import("@/app/explore/explore-page");
export const preloadExperimentsListPage = () => import("@/app/experiments/experiments-list-page");
export const preloadExperimentDetailPage = () => import("@/app/experiments/experiment-detail-page");
export const preloadReportsListPage = () => import("@/app/reports/reports-list-page");
export const preloadReportViewPage = () => import("@/app/reports/report-view-page");
export const preloadReportBuilderPage = () => import("@/app/reports/report-builder-page");
export const preloadConnectionsPage = () => import("@/app/connections/connections-page");
export const preloadConnectSourcePage = () => import("@/app/connections/connect-source-page");
export const preloadSettingsPage = () => import("@/app/settings/settings-page");
