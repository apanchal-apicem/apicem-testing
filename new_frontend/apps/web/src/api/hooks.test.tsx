import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

// Only what hooks.ts actually imports from these two modules — kept minimal
// rather than mirroring their full real shape, since a test-only factory
// isn't checked against the real module's type.
vi.mock("./client", () => ({
  apiClient: {
    switchWorkspace: vi.fn().mockResolvedValue({
      id: "wksp_aurora",
      name: "Aurora",
      slug: "aurora",
      plan: "starter",
      memberCount: 1,
    }),
    createWorkspace: vi.fn().mockResolvedValue({
      id: "wksp_new",
      name: "New Client",
      slug: "new-client",
      plan: "starter",
      memberCount: 1,
    }),
  },
}));

vi.mock("./query-client", () => ({
  STALE_TIME: { STABLE: 300_000, LIVE: 60_000 },
  queryPersister: { removeClient: vi.fn().mockResolvedValue(undefined) },
}));

import { useCreateWorkspace, useSwitchWorkspace } from "./hooks";
import { queryPersister } from "./query-client";

/**
 * Regression test for the cache-persistence race documented in SECURITY.md
 * ("Switching workspaces") and PERFORMANCE.md: `queryClient.clear()` alone
 * doesn't synchronously flush the throttled localStorage snapshot, so a
 * reload right after a switch could restore the *previous* workspace's
 * stale cache. The fix was calling the persister's `removeClient()`
 * alongside `clear()` — this asserts both actually happen on success,
 * not just the in-memory clear.
 */
function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  }
  return { queryClient, Wrapper };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("clearing workspace-scoped cache on switch/create", () => {
  it("clears the in-memory query cache and removes the persisted snapshot on a successful switch", async () => {
    const { queryClient, Wrapper } = makeWrapper();
    const clearSpy = vi.spyOn(queryClient, "clear");
    const { result } = renderHook(() => useSwitchWorkspace(), {
      wrapper: Wrapper,
    });

    result.current.mutate("wksp_aurora");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(queryPersister.removeClient).toHaveBeenCalledTimes(1);
  });

  it("does the same when creating a workspace, since creating also switches the session into it", async () => {
    const { queryClient, Wrapper } = makeWrapper();
    const clearSpy = vi.spyOn(queryClient, "clear");
    const { result } = renderHook(() => useCreateWorkspace(), {
      wrapper: Wrapper,
    });

    result.current.mutate({ name: "New Client" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(queryPersister.removeClient).toHaveBeenCalledTimes(1);
  });
});
