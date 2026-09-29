import { QueryClient, defaultShouldDehydrateQuery } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { Persister } from "@tanstack/react-query-persist-client";

/**
 * Query keys worth persisting across a full reload — small, stable-ish
 * reference and list data the user looks at repeatedly (metrics, sources,
 * reports, experiments, ...). A cold reload paints from this cache
 * immediately while a background revalidation runs, instead of every nav
 * re-hitting the network. See PERFORMANCE.md.
 *
 * Deliberately excluded: `block-data` (report-block chart data, keyed by
 * arbitrary metric/preset ids — many small dynamic entries, cheap to
 * recompute, not worth the storage) and anything from `runQuery` (a mutation,
 * never persisted by this mechanism anyway — every question is a fresh ask).
 */
const PERSISTED_KEY_NAMESPACES = new Set([
  "me",
  "workspace",
  "members",
  "data-sources",
  "metrics",
  "starter-questions",
  "workbooks",
  "reports",
  "experiments",
]);

/**
 * Two staleness tiers, chosen deliberately rather than left as unlabeled
 * numbers on whichever hook happened to need one:
 *
 * - `STABLE` (the default for every query): data this app's own mutations
 *   are the only realistic source of change for. A mutation invalidates its
 *   own key the moment it changes something, so trusting the cache in
 *   between costs nothing — there's no correctness reason to ever refetch
 *   sooner than this.
 * - `LIVE`: data that can plausibly change from outside the current user's
 *   own actions — a background sync job, another teammate. Refetched more
 *   readily, but still not on every render.
 *
 * A query that doesn't explicitly pick LIVE gets STABLE by default; that's
 * the right default for this app; opt into LIVE per-hook rather than the
 * other way around.
 */
export const STALE_TIME = {
  STABLE: 5 * 60_000,
  LIVE: 60_000,
} as const;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIME.STABLE,
      gcTime: 24 * 60 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const PERSIST_STORAGE_KEY = "apicem.queryCache";
// Bump this if a persisted shape would no longer match a current query's
// expected type — old caches under a stale buster are simply ignored rather
// than fed to a component that doesn't expect their shape.
const PERSIST_BUSTER = "v1";

export const queryPersister: Persister = createSyncStoragePersister({
  storage: typeof window !== "undefined" ? window.localStorage : undefined,
  key: PERSIST_STORAGE_KEY,
});

export const persistOptions = {
  persister: queryPersister,
  maxAge: 24 * 60 * 60_000,
  buster: PERSIST_BUSTER,
  dehydrateOptions: {
    shouldDehydrateQuery: (query: Parameters<typeof defaultShouldDehydrateQuery>[0]) => {
      if (!defaultShouldDehydrateQuery(query)) return false;
      const namespace = query.queryKey[0];
      return typeof namespace === "string" && PERSISTED_KEY_NAMESPACES.has(namespace);
    },
  },
};
