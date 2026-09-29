import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "./app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuthStore } from "@/stores/auth";

function renderShell() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/login" element={<div>Login page</div>} />
            <Route element={<AppShell />}>
              <Route path="/" element={<div>Home content</div>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

/**
 * Regression test: signing out (useAuthStore.signOut, wired to the
 * sidebar's Sign out item) used to do nothing but navigate to /login —
 * nothing actually gated the protected routes, so typing the URL for any
 * page under AppShell straight back into the address bar (or just clicking
 * a bookmark) landed the user right back in the app with no login prompt.
 */
describe("AppShell", () => {
  afterEach(() => {
    useAuthStore.setState({ isAuthenticated: true });
  });

  it("renders the protected route while signed in", () => {
    renderShell();
    expect(screen.getByText("Home content")).toBeInTheDocument();
  });

  it("redirects to /login instead of the protected route once signed out", () => {
    useAuthStore.getState().signOut();
    renderShell();
    expect(screen.getByText("Login page")).toBeInTheDocument();
    expect(screen.queryByText("Home content")).not.toBeInTheDocument();
  });
});
