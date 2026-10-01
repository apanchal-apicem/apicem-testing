import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "react-redux";
import { AppShell } from "./app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { authActions, store } from "@/store";

function renderShell() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <Provider store={store}>
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
      </QueryClientProvider>
    </Provider>,
  );
}

/**
 * Regression test: signing out, wired to the sidebar's Sign out item, must
 * not allow a direct revisit to a protected route —
 * nothing actually gated the protected routes, so typing the URL for any
 * page under AppShell straight back into the address bar (or just clicking
 * a bookmark) landed the user right back in the app with no login prompt.
 */
describe("AppShell", () => {
  afterEach(() => {
    store.dispatch(authActions.setStatus("authenticated"));
  });

  it("renders the protected route while signed in", () => {
    renderShell();
    expect(screen.getByText("Home content")).toBeInTheDocument();
  });

  it("redirects to /login instead of the protected route once signed out", () => {
    store.dispatch(authActions.setStatus("unauthenticated"));
    renderShell();
    expect(screen.getByText("Login page")).toBeInTheDocument();
    expect(screen.queryByText("Home content")).not.toBeInTheDocument();
  });
});
