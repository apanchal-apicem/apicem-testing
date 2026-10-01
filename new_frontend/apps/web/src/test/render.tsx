import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "react-redux";
import { store } from "@/store";

/**
 * Renders a page component against the real mock adapter (the default
 * `apiClient` in a test environment, same as a dev build with no
 * `VITE_USE_MOCK=false` set) rather than mocking hooks individually — an
 * actual page-level smoke test exercises the real path from hook through
 * `apiClient` to the seeded fixtures, which is exactly what would catch a
 * page silently breaking against real data shapes. `path` only needs to be
 * set when the page reads a route param (`useParams`); `route` is the
 * concrete URL that param resolves from.
 */
export function renderPage(ui: ReactElement, { route = "/", path = "/" }: { route?: string; path?: string } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route path={path} element={ui} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </Provider>,
  );
}
