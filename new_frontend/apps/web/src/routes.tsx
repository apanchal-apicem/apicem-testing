import { lazy, Suspense, useEffect } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { initializeAuth, useAppDispatch } from "@/store";
import { HomePage } from "@/app/home/home-page";
import {
  preloadConnectSourcePage,
  preloadConnectionsPage,
  preloadExperimentDetailPage,
  preloadExperimentsListPage,
  preloadExplorePage,
  preloadReportBuilderPage,
  preloadReportViewPage,
  preloadReportsListPage,
  preloadSettingsPage,
} from "@/route-preload";

// HomePage and AppShell load eagerly — that's the first paint for the most
// common entry point, so it shouldn't wait on an extra chunk fetch. Every
// other route is a separate chunk: opening the report builder shouldn't cost
// the user dnd-kit and Recharts before they've even asked to explore data,
// and vice versa. See PERFORMANCE.md.
const LoginPage = lazy(() =>
  import("@/app/auth/login-page").then((m) => ({ default: m.LoginPage })),
);
const OnboardingPage = lazy(() =>
  import("@/app/onboarding/onboarding-page").then((m) => ({
    default: m.OnboardingPage,
  })),
);
const ExplorePage = lazy(() =>
  preloadExplorePage().then((m) => ({ default: m.ExplorePage })),
);
const ExperimentsListPage = lazy(() =>
  preloadExperimentsListPage().then((m) => ({
    default: m.ExperimentsListPage,
  })),
);
const ExperimentDetailPage = lazy(() =>
  preloadExperimentDetailPage().then((m) => ({
    default: m.ExperimentDetailPage,
  })),
);
const ReportsListPage = lazy(() =>
  preloadReportsListPage().then((m) => ({ default: m.ReportsListPage })),
);
const ReportViewPage = lazy(() =>
  preloadReportViewPage().then((m) => ({ default: m.ReportViewPage })),
);
const ReportBuilderPage = lazy(() =>
  preloadReportBuilderPage().then((m) => ({ default: m.ReportBuilderPage })),
);
const ConnectionsPage = lazy(() =>
  preloadConnectionsPage().then((m) => ({ default: m.ConnectionsPage })),
);
const ConnectSourcePage = lazy(() =>
  preloadConnectSourcePage().then((m) => ({ default: m.ConnectSourcePage })),
);
const SettingsPage = lazy(() =>
  preloadSettingsPage().then((m) => ({ default: m.SettingsPage })),
);

export function AppRoutes() {
  const dispatch = useAppDispatch();
  useEffect(() => {
    void dispatch(initializeAuth());
  }, [dispatch]);

  return (
    // Only reached by /login and /onboarding — the AppShell branch has its
    // own Suspense scoped to the content area so the sidebar never unmounts.
    <Suspense fallback={null}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />

        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/explore" element={<ExplorePage />} />
          <Route path="/explore/:workbookId" element={<ExplorePage />} />
          <Route path="/experiments" element={<ExperimentsListPage />} />
          <Route
            path="/experiments/:experimentId"
            element={<ExperimentDetailPage />}
          />
          <Route path="/reports" element={<ReportsListPage />} />
          <Route path="/reports/:reportId" element={<ReportViewPage />} />
          <Route
            path="/reports/:reportId/edit"
            element={<ReportBuilderPage />}
          />
          <Route path="/connections" element={<ConnectionsPage />} />
          <Route path="/connections/new" element={<ConnectSourcePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
