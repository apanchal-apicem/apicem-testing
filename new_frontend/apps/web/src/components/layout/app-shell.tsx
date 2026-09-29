import { Suspense } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { Sidebar } from "./sidebar";
import { MobileTopBar } from "./mobile-nav";
import { RouteSkeleton } from "./route-skeleton";
import { useAuthStore } from "@/stores/auth";

export function AppShell() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      {/* First focusable element on every page: without it, a keyboard user
          re-tabs through every sidebar link on every navigation before
          reaching the content those links point at. Visually hidden until
          it receives focus. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-full focus:bg-primary focus:px-4 focus:py-2 focus:text-[13px] focus:font-semibold focus:text-primary-ink"
      >
        Skip to content
      </a>
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <MobileTopBar />
        <div id="main-content" tabIndex={-1} className="mx-auto max-w-[1400px] px-4 py-6 outline-none sm:px-8 sm:py-8 md:px-10">
          <Suspense fallback={<RouteSkeleton />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
  );
}
