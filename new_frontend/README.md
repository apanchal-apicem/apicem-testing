# Apicem Engine

A configurable metrics engine: connect any data source, standardize it, apply
consistent business logic, and get analytics-ready answers — as a chat-style
question, a manually built exploration, a pixel-perfect drag-and-drop report,
or a real incrementality experiment (geo/segment holdout testing, causal
lift — not just correlated dashboards).

See **SECURITY.md** for the two guarantees this product is built around
(tenant isolation that never depends on a prompt, and sync jobs that are
idempotent by construction) and what's still open before a real launch. See
**PERFORMANCE.md** for why navigating around this app doesn't cost a network
round trip most of the time, and what to keep true as it grows.

below.
This folder holds the **frontend** (`apps/web`), built against realistic
fixture data so it can run standalone. The sibling `../backend` contains the
FastAPI service; its V1 routes are being connected incrementally through the
REST contract in `apps/web/src/api/real/adapter.ts`.

## Stack

- **React 19 + Vite 8 + TypeScript**, strict mode
- **Tailwind CSS v4** (CSS-first config, tokens in `apps/web/src/styles/theme.css`)
- **Radix UI** primitives (dialog, dropdown, tabs, select, popover, switch, tooltip)
- **TanStack Query** for server state and caching
- **Redux Toolkit** for shared client state (auth status, theme, sidebar, report-builder canvas)
- **Axios** for real-backend HTTP requests
- **dnd-kit** for the report builder's drag-and-drop canvas
- **Recharts** for charts
- **npm workspaces** monorepo (`apps/*`, `packages/*`)

## Getting started

```bash
npm install
npm run dev
```

Opens at `http://localhost:5173`. No backend, no environment variables, no
accounts required — it runs entirely on fixture data for a demo workspace
("Northwind Outfitters", a fictional DTC outfitter).

The dev server listens on every network interface (`host: true` in
`vite.config.ts`), not just `localhost`, so a phone on the same Wi-Fi can
reach it at `http://<this machine's LAN IP>:5173` — genuinely useful for
checking the responsive layout on a real device instead of a resized browser
window. The tradeoff: anyone else on that same network can reach it too,
with no login worth the name behind it (see "What's explicitly not true
yet" in SECURITY.md). Fine on a home network or a personal hotspot; at a
venue with shared or public Wi-Fi, use a personal hotspot for this rather
than the venue's network.

Other root-level scripts: `npm run build`, `npm run lint`, `npm run typecheck`,
`npm run test` (all proxy to `apps/web`).

## Testing

`npm run test` runs the Vitest suite once; `npm run test:watch` (from
`apps/web`) keeps it running while you edit. Coverage started with the logic
that's easy to silently break and hard to eyeball-verify in a browser, and
has since grown to cover most of it end to end:

- **Tenant isolation and workspace switching**
  (`api/mock/adapter.test.ts`) — a switch never returns another workspace's
  data, `switchWorkspace` actually rejects a non-member id instead of
  silently falling back to one, a stale persisted workspace id recovers to
  the default on load.
- **Idempotent sync retries** (`api/mock/adapter.test.ts`) — landing on the
  true row count, never a cumulative sum.
- **The query-resolution engine** (`api/mock/fixtures.test.ts`) — the actual
  logic behind Explore's Ask/Build tabs: metric resolution, dimension
  group-by precedence, exact and fuzzy question matching, and the
  low-confidence fallback for a question matching nothing.
- **The experiment lift-series generator** (`api/mock/fixtures.test.ts`) —
  the ramp-in shape behind the treatment-vs-holdout chart.
- **The report builder** (`features/builder/grid-utils.test.ts`,
  `stores/builder.test.ts`) — grid/pixel conversion math, and the block
  add/move/resize/remove/z-order state machine the canvas's drag-and-drop
  actually mutates.
- **The cache-persistence fix** described in SECURITY.md's "Switching
  workspaces" section (`api/hooks.test.tsx`), and the request schemas in
  `@apicem/api-contract` enforcing what they claim to
  (`test/contract-schemas.test.ts`).
- **Page-level smoke tests** for Home, Explore, Reports, the report builder,
  Experiments (list and detail), Connections, connecting a new source,
  Login, and Onboarding — rendered against the real mock adapter rather than
  mocked hooks, so they exercise the actual hook → `apiClient` → fixtures
  path, not a stand-in for it.

Writing these caught two real bugs, not just theoretical ones: the dead
`switchWorkspace` membership check (see SECURITY.md), and the
natural-language fuzzy-match fallback in the query engine, which could never
actually match a metric by name (every metric id in a workspace shares the
same generic prefix, so matching on an id's first segment only ever found
that meaningless prefix — fixed to check every segment of the id instead).

Not covered, deliberately: dnd-kit's own pointer-event handling (the state
it drives is tested directly instead), Recharts' rendering internals, and
exhaustive prop/variant combinations of design-system primitives.

`.github/workflows/ci.yml` runs typecheck, lint, the test suite, a
production build, and `npm audit` on every push and PR to `main` — the same
checks above, just enforced automatically instead of relying on whoever's
reviewing to remember to run them.

## Project structure

```
apps/
  web/                    the frontend (this is what you're looking at)
    src/
      app/                route-level pages, one folder per area
        auth/ home/ onboarding/ explore/ reports/ connections/ settings/
      components/
        ui/               design-system primitives (Button, Dialog, Tabs, …)
        layout/            AppShell, Sidebar, PageHeader, ThemeToggle
        charts/            KpiTile, chart renderers, data table, confidence badge
      features/           feature-specific composed UI
        sources/           source type metadata, connect-flow fields, schema list, sync history
        explorer/           drag-and-drop field chips + shelves
        ask/                 result panel, starter questions
        builder/            report-builder canvas, palette, block rendering
        reports/             save-to-report popover
        workbooks/           home page workbook cards
        experiments/         incrementality lift chart, status badge, create-experiment dialog
      api/
        types.ts            the ApiClient interface — the actual frontend/backend contract
        client.ts            picks mock vs real based on VITE_USE_MOCK
        hooks.ts             every React Query hook the app uses
        mock/                fixture data + mock adapter (in-memory + localStorage)
        real/                Axios adapter for the real backend
      store.ts               Redux Toolkit store and slices
packages/
  api-contract/           shared TypeScript types + zod schemas for request bodies —
                          import this from the backend once it exists, so both sides
                          of the wire are typed from one source of truth
```

## How mock vs. real works

Every screen calls `apiClient` (from `src/api/client.ts`), never a fetch call
directly. `apiClient` is either `mockClient` or `realClient` — same
`ApiClient` interface (`src/api/types.ts`), chosen by one env var:

```
# apps/web/.env.local  (copy from .env.example)
VITE_USE_MOCK=false
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

Defaults to mock when unset, so a fresh clone always runs standalone.

## Plugging in the real backend

1. Read `apps/web/src/api/types.ts` — the `ApiClient` interface is the whole
   contract. Every method your backend needs to serve is listed there with
   its exact request/response types.
2. Read `apps/web/src/api/real/adapter.ts` — the REST paths and verbs it
   expects are documented in a comment at the top. Implement those endpoints
   (or edit the paths in that one file if your routing differs — it's the
   only file that should need to change).
3. Import types and zod schemas for request bodies from `@apicem/api-contract`
   (add it as a workspace dependency to your backend package) so both sides
   validate against the same shapes — this is the "define the API contract"
   step from the project plan, enforced by the compiler instead of a doc.
4. Set `VITE_USE_MOCK=false` and `VITE_API_BASE_URL` in `apps/web/.env.local`.
   No frontend code changes required.

The one thing the mock adapter does that a real backend should also do:
`getBlockData(source, key)` re-resolves the data behind a saved report block
(a metric id or a named result key) — every `QueryResult` carries a
`resolvedKey` for exactly this purpose, so a report block saved today can be
re-fetched correctly later.

## What's built

- **Home** — workbook/report grid, data source health, starter questions
- **Connections** — list existing sources; multi-step connect flow (pick
  type → enter credentials → schema-scan confirmation)
- **Explore** — ask a question in plain language, or drag metric/dimension
  chips onto Value/Group-by shelves to build a view by hand; both paths
  render through the same result panel (chart/data/SQL tabs, confidence
  score, "Add to report")
- **Reports** — list of saved reports; a full drag-and-drop builder (dnd-kit)
  with a floating block palette (KPI, chart, table, text, divider, image),
  free-form positioning, resize, and autosave-on-demand. Every block is also
  a real keyboard control (see **Accessibility** below), not drag-only
- **Experiments** — geo/customer-segment holdout testing: define a treatment
  and holdout group, and see causal lift, incremental value, iROAS, and a
  confidence interval against a treatment-vs-holdout chart — the thing most
  BI tools don't offer, distinct from `runQuery`'s correlational answers
- **Connections → Sync history** — per-source run log demonstrating the
  idempotency guarantee directly: a failed run followed by a retry lands on
  the source's true row count, never a duplicate, same idempotency key both
  times
- **Settings** — workspace details, members & roles, usage limits
- **Onboarding / Login** — first-run flow and a stubbed auth screen (no real
  auth logic — this workspace has no accounts to protect yet)
- **Multi-workspace** — switch between workspaces (or create a new, empty
  one) from the sidebar without leaving the page. Each workspace is a
  genuinely isolated bundle of data sources, metrics, reports, and
  experiments — not a filtered view of one shared set — the same modeling
  the real backend's tenant isolation has to hold to (see SECURITY.md,
  "Tenant isolation" and "Switching workspaces"). A person's role
  (owner/admin/editor/viewer) is per-workspace membership, not a single
  global field, since the same person can own one workspace and be an
  invited editor on another.
- **Settings → Demo data** (mock mode only) — wipes every workspace back to
  its original seeded state in one click, including anything created or
  edited during the session. Meant for a booth or a run of back-to-back demo
  conversations, so the next person sees a clean demo rather than whatever
  the last one left behind; disappears once a real backend is plugged in,
  since it has no equivalent on that side.

Light and dark themes are both fully themed (see the toggle in the sidebar).
The layout is responsive down to phone width — the sidebar collapses into a
slide-over drawer below the `lg` breakpoint, and every page's controls wrap
or stack instead of forcing horizontal scroll.

## Accessibility

A first pass, not a certification. What's actually true:

- **Every icon-only control has a real accessible name** — dialog close
  buttons, back buttons, remove/clear/more-actions buttons, the chart-type
  switcher (which also exposes its selected state via `aria-pressed`) — not
  just a `title` attribute, which several screen readers don't reliably
  announce.
- **A "Skip to content" link** is the first focusable element on every
  authenticated page, landing on the actual page content instead of
  re-tabbing through the sidebar on every navigation.
- **The report builder's canvas is fully keyboard-operable**, not
  drag-only: Tab reaches a block (selecting it, same as a click), arrow keys
  move it one grid unit, Shift+arrow resizes it, Delete/Backspace removes
  it — guarded so those same keys still behave normally while typing in a
  text block's own title/body fields. Adding a block from the palette and
  removing a selected one were already keyboard-reachable (both are real
  buttons); moving and resizing an existing block were not, until this pass.
- **Every interactive element has a visible keyboard-focus indicator** — a
  global 2px accent outline by default, or a deliberate border/ring color
  change on inputs, selects, and switches specifically (checked for
  contrast in both themes, not just assumed).
- **All of the above is covered by tests**, not just asserted — see
  `stores/builder.test.ts` and `app/reports/report-builder-page.test.tsx`.
- **Enforced going forward, not just true today**: `oxlint`'s `jsx-a11y`
  plugin is enabled in `.oxlintrc.json` and runs as part of `npm run lint`,
  which CI runs on every push and PR — the same "make it a standing
  guarantee, not a one-time pass" reasoning `npm audit` in CI already
  follows for dependency vulnerabilities. A few deliberate, correct patterns
  it flags anyway (the report builder's block frame is a custom `role="group"`
  widget by necessity, not an oversight — a native `<button>` can't legally
  contain the other interactive controls it does) are suppressed inline
  with an `oxlint-disable-next-line` comment explaining why, not silently.

- **Every real text/background and UI-boundary pairing in the design tokens
  meets WCAG AA**, computed against the actual `theme.css` values (not
  eyeballed) — see `styles/theme.contrast.test.ts`. This audit found and
  fixed four real failures in both themes: `--ink-faint` (timestamps, hints)
  and `--border-strong` (input/card borders) were both under-contrast
  everywhere they're used; white text/icons on `--success`/`--danger` fills
  failed specifically in dark mode (fixed by switching to `--primary-ink`,
  which already inverts correctly per theme, rather than a hardcoded
  color); and two borderline cases (`--success` text on its own `-soft`
  badge, and the `--accent` focus ring) needed a small nudge once the
  audit's own luminance math was corrected — a genuine bug in that math (a
  copy-paste typo, the blue-channel weight was `0.2722` instead of the
  WCAG-correct `0.0722`) was caught by its own regression test scoring
  white-on-black at a physically impossible ratio, and would otherwise have
  left two real failures marked as passing. Avatar background colors are
  arbitrary per-person values with no single fixed text color that reads on
  all of them; `initialsTextClass` (`lib/color.ts`) picks white or dark text
  per color by the same math, verified against every seeded color in
  `avatar.test.tsx`.
- **Every chart has a real accessible description**, not silence. Recharts'
  SVG output has no accessible content of its own — a screen reader
  reaching one previously got an unlabeled pile of internal nodes. Every
  chart component now wraps its `ResponsiveContainer` in `role="img"` with
  a computed summary (`components/charts/chart-summary.ts`: metric name,
  point count, first/last value, trend direction, range — or, for the
  experiment lift chart, both series' start and end values), tested in
  `chart-summary.test.ts` and verified live in the browser on both the
  Explore result panel and the experiment detail page. The KPI tile's tiny
  sparkline is the one deliberate exception — it's marked `aria-hidden`
  instead, since the delta text right next to it already states the same
  trend in words, and repeating it would just be noise.
- **Status changes that happen without user action are announced**, not
  just visible: the report builder's "Unsaved changes" / "All changes
  saved" indicator, Explore's "loading" → result transition, and the
  report/experiment detail pages' initial load all use a real `<output>`
  element (rather than `role="status"` bolted onto a `<div>`, which oxlint's
  `jsx-a11y` plugin correctly flagged in favor of the semantic tag) so a
  screen reader hears the change even if focus is elsewhere on the page.

Not done: a full screen-reader pass with an actual screen reader (VoiceOver/
NVDA) — this environment has neither available to drive programmatically;
what's here instead is a rigorous accessibility-tree inspection (the same
role/name/state data a screen reader consumes), which is a real substitute
for some of what a screen reader catches, not a claim of having used one.

## What's not built yet (by design)

- Real authentication/session handling
- Filter shelf in the explorer (UI is present, wired for later)
- Image upload in the report builder's image block
- Anything that requires a real backend: live connectors, real query
  execution, real RBAC enforcement
