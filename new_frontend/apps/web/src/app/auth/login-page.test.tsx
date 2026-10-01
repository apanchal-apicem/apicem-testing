import { afterEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderPage } from "@/test/render";
import { LoginPage } from "./login-page";
import { Provider } from "react-redux";
import { authActions, store } from "@/store";

// LoginPage only makes sense to look at while signed out — renderPage
// mounts it at /login specifically (not the default "/") so its own
// signed-in guard (see login-page.tsx) has somewhere else to redirect to
// without every route being this same element.
function renderLoginPage() {
  store.dispatch(authActions.setStatus("unauthenticated"));
  return renderPage(<LoginPage />, { route: "/login", path: "/login" });
}

describe("LoginPage", () => {
  afterEach(() => {
    store.dispatch(authActions.setStatus("authenticated"));
  });

  it("renders the sign-in form with the real seeded user's email pre-filled", () => {
    renderLoginPage();
    expect(screen.getByText("Sign in to your workspace")).toBeInTheDocument();
    expect(screen.getByLabelText("Work email")).toHaveValue(
      "jordan@apicemengine.com",
    );
    expect(
      screen.getByText(/any sign-in credentials work/),
    ).toBeInTheDocument();
  });

  it("creates a demo account and authenticates through the mock adapter", async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.click(screen.getByRole("button", { name: "Create an account" }));
    await user.type(
      screen.getByLabelText("Workspace name"),
      "Example Workspace",
    );
    await user.clear(screen.getByLabelText("Work email"));
    await user.type(screen.getByLabelText("Work email"), "owner@example.com");
    await user.type(screen.getByLabelText("Password"), "valid-password");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => {
      expect(store.getState().auth.status).toBe("authenticated");
    });
  });

  it("walks from Forgot password through to a confirmation and back to sign in", async () => {
    const user = userEvent.setup();
    renderLoginPage();

    await user.click(screen.getByRole("button", { name: "Forgot password?" }));
    expect(screen.getByText("Reset your password")).toBeInTheDocument();
    expect(screen.getByLabelText("Work email")).toHaveValue(
      "jordan@apicemengine.com",
    );

    await user.click(screen.getByRole("button", { name: "Send reset link" }));
    expect(await screen.findByText("Check your email")).toBeInTheDocument();
    expect(screen.getByText(/jordan@apicemengine.com/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to sign in" }));
    expect(screen.getByText("Sign in to your workspace")).toBeInTheDocument();
  });

  /**
   * Regression test: the browser's back button (or a stale /login history
   * entry, or just typing the URL) used to render the login form even for
   * an already-signed-in user, since nothing on this route checked auth
   * state — it only ever rendered based on how it was reached.
   */
  it("redirects away from /login instead of rendering the form when already signed in", () => {
    store.dispatch(authActions.setStatus("authenticated"));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <Provider store={store}>
          <MemoryRouter initialEntries={["/login"]}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={<div>Home content</div>} />
            </Routes>
          </MemoryRouter>
        </Provider>
      </QueryClientProvider>,
    );
    expect(
      screen.queryByText("Sign in to your workspace"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Home content")).toBeInTheDocument();
  });
});
