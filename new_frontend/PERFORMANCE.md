# Performance

The goal: opening the app, and moving between screens in it, should feel
instant — not "fast for a web app," actually instant. This is how, and what
to keep true once a real backend replaces the mock.

## The four things that actually matter

**1. Ship less JavaScript up front.** Every route below `/` is a separate
lazy chunk (`routes.tsx`) instead of one bundle — before this, `npm run
build` produced a single ~1MB (300KB gzipped) file every visitor downloaded
regardless of which page they landed on. Opening the report builder shouldn't
cost a first-time visitor to Home a chunk of dnd-kit and Recharts they
haven't asked for yet. `AppShell`'s `Suspense` boundary is scoped to just the
content area (`app-shell.tsx`) so a route swap never unmounts the sidebar —
only the panel that's actually changing shows the brief skeleton.

**2. Never wait on data you already have.** The React Query cache persists to
`localStorage` (`api/query-client.ts`) for a defined allowlist of stable,
frequently-revisited data — metrics, data sources, reports, experiments,
workbooks, workspace/user info. A full page reload paints from that cache
immediately and revalidates in the background, instead of every reload
re-fetching everything from zero. Default `staleTime` is 5 minutes for
reference/list data (every mutation invalidates its own key explicitly the
moment something actually changes, so trusting the cache in between costs
nothing); data-source sync status gets a shorter 1-minute `staleTime` since
it can change from a background job the current user didn't trigger.

Deliberately *not* persisted: `block-data` (report-block chart data, keyed by
many small dynamic metric/preset ids — cheap to recompute, not worth the
storage) and anything from `runQuery` (a mutation — every question is
supposed to be a fresh ask).

Persisting to `localStorage` is throttled, not instant — fine for the normal
case, but it means a workspace switch followed immediately by a reload can
outrun the write and restore the *previous* workspace's stale snapshot. See
SECURITY.md, "Switching workspaces," for the real bug this caused and the
fix (`clearWorkspaceScopedCache` removes the persisted snapshot synchronously
on switch, rather than trusting the throttle). Worth remembering as a
category: any time cached data's meaning can change out from under a page
reload — not just across workspaces — the persist-on-throttle tradeoff needs
a second look, not just a longer `staleTime`.

**3. Start fetching before the click, not after.** `route-prefetch.ts` warms
both the destination route's JS chunk and its first query on
hover/keyboard-focus of a nav link, a workbook/report card, or an experiment
card (`route-preload.ts` holds the shared `import()` calls so the hover
warm-up and the actual lazy route resolve to the same chunk). By the time a
click lands, there's frequently nothing left to wait on.

**4. Don't let the mock lie about what "fast" costs.** The mock adapter
simulates 40-130ms of latency per call — enough to exercise real loading
states, not enough to train every screen to tolerate being slow. If this
were 500ms+, every layout would get built around hiding that latency instead
of being built to just be fast; the discipline should come first, and a
slow real endpoint should be the thing that visibly stands out later, not
the norm the UI was designed around.

## Extending this

- Adding a new route with more than a trivial component tree: give it a
  `lazy()` entry in `routes.tsx` and a matching preloader in
  `route-preload.ts`, the same way every existing route does.
- Adding a new query users will revisit often: add its `queryKeys` namespace
  to `PERSISTED_KEY_NAMESPACES` in `api/query-client.ts` only if it's small
  and stable — large or highly dynamic result sets should stay
  cache-only-in-memory, not persisted.
- Linking to something a user is likely to open next (a card, a nav item):
  wire an `onMouseEnter`/`onFocus` prefetch the way `WorkbookCard`,
  `ReportsListPage`, and `ExperimentsListPage` already do, rather than
  leaving the destination to fetch cold.

## Once a real backend exists

Everything above still applies unchanged — the frontend's caching and
prefetching don't care whether `apiClient` is the mock or the real adapter.
What the backend needs to hold up its end of "instant":

- Indexes on every column the query endpoints actually filter/sort by
  (workspace_id first, always — see SECURITY.md).
- `Cache-Control` / `ETag` headers on genuinely cacheable reads (metrics,
  schema, workspace/member lists) so a browser or CDN cache can skip the
  round trip entirely, not just skip re-parsing.
- A connection pool sized for the expected concurrent load — the single
  most common cause of a backend that's fast in isolation but slow under
  five simultaneous demo laptops.
- The natural-language query endpoint is the one place "fast" and "cheap"
  are in tension with an LLM call in the loop — cache identical questions
  per workspace for a short window, and make sure the model call itself
  isn't on the critical path for anything that doesn't need it (e.g. a
  saved report block re-fetches through `getBlockData`, never re-runs the
  original question).
