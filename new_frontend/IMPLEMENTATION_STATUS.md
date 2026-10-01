# Apicem Engine Frontend Implementation Status

> ⚠️ **NOTICE:** For the unified integration plan, roadmap, and current progress status, see the single source of truth:
> 👉 **[PLAN.md](file:///c:/Users/LAPTOP%20SHOP/Documents/Aayush/apicem_engine/apicem_engine_oct26/PLAN.md)**

**Reviewed:** 2026-09-29  
**Scope:** `new_frontend/apps/web` and the sibling FastAPI backend routes used by its real adapter.

## Executive Summary

The frontend has 12 page modules covering 13 route patterns. The routed UI, shared components, mock adapter, and page-level tests are largely implemented. Axios is the HTTP transport, Redux Toolkit holds shared client state, and TanStack Query remains responsible for server-state caching.

The local frontend is currently configured for **real mode** in `apps/web/.env.local` (`VITE_USE_MOCK=false`, API base `http://localhost:8000/api/v1`). Cookie-based signup/sign-in/session handling, several Settings writes, and the Shopify connection flow have backend support. Most analytics/data APIs do not: Home, Explore, experiments, reports, and saved-workbook pages will request endpoints missing from backend V1. As a result, the interface is not yet end-to-end ready against the real backend. The mock adapter still provides a complete fixture-backed demo when `VITE_USE_MOCK=true`.

## Shared Foundation

### Implemented

- Axios, Redux Toolkit, and React Redux are installed in the web workspace; Zustand has been removed.
- A typed Redux store contains `auth`, `builder`, `sidebar`, and `theme` slices. Real auth state tracks session status only; it does not store the cookie token.
- The real adapter uses a credentialed Axios client, maps API failures to `ApiError`, and retains a separate base URL for the legacy auth/tenant endpoints.
- TanStack Query remains the server-state and cache layer. Workspace switching/creation clears query and persisted workspace-scoped cache.
- Routes are lazy-loaded where appropriate; Home/AppShell remain eager. Route prefetch, page suspense, and route skeletons remain in place.
- `VITE_USE_MOCK` is the adapter switch. Unset defaults to mock; the current local `.env.local` explicitly selects real mode. Vitest setup stubs mock mode so fixture-backed page tests remain independent of a developer's local env file.

### Remaining

- Add contract-level tests for the Axios real adapter (cookie options, path/body mappings, API error normalization).
- Re-run the complete test suite and inspect all failures; the previous full-suite run did not return a final report.
- Resolve the two known lint warnings only if they remain after rechecking: `features/builder/block-palette.tsx` and `features/reports/save-to-report-popover.tsx`.

## Route-by-Route Status

| Route                        | Implemented behavior                                                                                                                                                                                                                                                               | Remaining work                                                                                                                                                                                                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`                     | Sign-in, account creation, password-reset request, pending/error UI, redirect when signed in. Real mode uses backend cookie routes; mock mode uses demo auth.                                                                                                                      | The email field is still initialized with the demo account address in real mode. Make its initial value mode-aware. Add the reset-token completion page/route and configure the reset callback URL for this frontend. Verify signup/sign-in against PostgreSQL and cookie/CORS settings. |
| `/onboarding`                | Four navigation steps: connect source, Explore, experiments, report creation; skip and step completion are recorded locally.                                                                                                                                                       | The intro still says Northwind fixture data is ready, which is inaccurate in real mode. Make copy mode-aware. Decide whether completion must persist per account rather than browser-local.                                                                                              |
| `/`                          | Home grid, workbook/report filters, source health, starter questions, Explore prompt, navigation, and explicit loading/error/empty states for workbooks, sources, experiments, and suggestions. Failed requests are not shown as empty data; retry and next actions are available. | Real backend lacks its sources, workbooks/reports, experiments, and starter-question endpoints. Add contract-compatible data APIs; verify query error states with the real adapter and browser.                                                                                          |
| `/explore`                   | Ask/query flow, follow-ups, manual metric/dimension/filter building, chart/data/SQL views, pivots, save-to-report, save-exploration, and experiment launch.                                                                                                                        | Backend lacks metrics, starter questions, query, pivot, block-data, and workbook APIs. Verify deep links, query failures, and empty real workspaces after APIs exist.                                                                                                                    |
| `/explore/:workbookId`       | Reopens a saved workbook/exploration and records a view.                                                                                                                                                                                                                           | Requires missing workbook detail/view APIs and real not-found/error handling.                                                                                                                                                                                                            |
| `/experiments`               | Experiment list, create dialog, status/lift summaries, and role-aware delete controls.                                                                                                                                                                                             | Backend lacks experiment list/create/delete persistence. Verify empty/loading/error states and authorization against real roles.                                                                                                                                                         |
| `/experiments/:experimentId` | Experiment design/results, charts, edit/delete controls, and missing/draft/running/completed presentation.                                                                                                                                                                         | Backend lacks detail/update/delete and results-generation APIs. Verify real result-loading/error states and authorization.                                                                                                                                                               |
| `/reports`                   | Report list, create/delete, role checks, and `?new=1` dialog trigger.                                                                                                                                                                                                              | Backend lacks report list/create/delete APIs. Scheduling and sharing are not implemented and remain out of scope unless separately requested.                                                                                                                                            |
| `/reports/:reportId`         | Read-only report canvas, block rendering, view tracking, and edit/delete actions.                                                                                                                                                                                                  | Backend lacks report detail/block-data/view APIs. Verify real missing-report, loading, and permission states.                                                                                                                                                                            |
| `/reports/:reportId/edit`    | Draggable/keyboard-operable builder, block palette, preview, dirty state, Redux state, and save action.                                                                                                                                                                            | Backend lacks report read/update APIs. Verify save/reload, drag/resize, and save-failure behavior with a real adapter.                                                                                                                                                                   |
| `/connections`               | Source status/list, schema/history dialogs, retry, remove confirmation, and sync history.                                                                                                                                                                                          | V1 now maps Shopify connections and extract runs to the frontend contract. Add mappings/connectors for the other offered source types and verify real browser sync completion.                                                                                                             |
| `/connections/new`           | Source-type selection, transient credential form, create request, then schema fetch for the newly created source. Mock schemas are persisted per workspace.                                                                                                                        | Real mode now offers Shopify only, stores mapped credentials encrypted, and returns an empty schema until the first successful sync. Add source-specific forms/connectors before enabling other types.                                                                                     |
| `/settings` General          | Workspace name save, workspace URL/plan/member display; rename uses legacy `/tenant`. Owners/admins can edit; other members receive a read-only explanation. The slug/URL deliberately remains stable after a rename.                                                                  | Verify cross-workspace refresh in a browser.                                                                                                                                                                                                                                              |
| `/settings` Account          | Profile-name and password mutations with success/error feedback. Backend enforces the same 8-72 character password rule for signup, reset, change, and member creation.                                                                                                             | Reset-token completion is still missing.                                                                                                                                                                                                                                                  |
| `/settings` Members          | Role changes go through the membership API; self-change/owner changes and unauthorized admin grants are disallowed. Every tenant-scoped authorization check resolves the current membership from the database, so demotions take effect immediately despite an existing session cookie. | Add cross-workspace refresh coverage.                                                                                                                                                                                                                                                     |
| `/settings` Usage            | Source/member counts shown without unenforced hard-coded plan limits; query totals are honestly marked unavailable.                                                                                                                                                                | Add plan-limit and query-usage APIs before displaying quotas or monthly query numbers.                                                                                                                                                                                                   |
| `/settings` Demo data        | Mock-only owner-gated reset.                                                                                                                                                                                                                                                       | Keep unavailable in real mode; this is not a real-backend reset operation.                                                                                                                                                                                                               |

### Page Source and Test Map

| Route(s)                           | Page module                                               | Page test                                                      |
| ---------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------- |
| `/login`                           | `apps/web/src/app/auth/login-page.tsx`                    | `apps/web/src/app/auth/login-page.test.tsx`                    |
| `/onboarding`                      | `apps/web/src/app/onboarding/onboarding-page.tsx`         | `apps/web/src/app/onboarding/onboarding-page.test.tsx`         |
| `/`                                | `apps/web/src/app/home/home-page.tsx`                     | `apps/web/src/app/home/home-page.test.tsx`                     |
| `/explore`, `/explore/:workbookId` | `apps/web/src/app/explore/explore-page.tsx`               | `apps/web/src/app/explore/explore-page.test.tsx`               |
| `/experiments`                     | `apps/web/src/app/experiments/experiments-list-page.tsx`  | `apps/web/src/app/experiments/experiments-list-page.test.tsx`  |
| `/experiments/:experimentId`       | `apps/web/src/app/experiments/experiment-detail-page.tsx` | `apps/web/src/app/experiments/experiment-detail-page.test.tsx` |
| `/reports`                         | `apps/web/src/app/reports/reports-list-page.tsx`          | `apps/web/src/app/reports/reports-list-page.test.tsx`          |
| `/reports/:reportId`               | `apps/web/src/app/reports/report-view-page.tsx`           | `apps/web/src/app/reports/report-view-page.test.tsx`           |
| `/reports/:reportId/edit`          | `apps/web/src/app/reports/report-builder-page.tsx`        | `apps/web/src/app/reports/report-builder-page.test.tsx`        |
| `/connections`                     | `apps/web/src/app/connections/connections-page.tsx`       | `apps/web/src/app/connections/connections-page.test.tsx`       |
| `/connections/new`                 | `apps/web/src/app/connections/connect-source-page.tsx`    | `apps/web/src/app/connections/connect-source-page.test.tsx`    |
| `/settings` and `?tab=` variants   | `apps/web/src/app/settings/settings-page.tsx`             | `apps/web/src/app/settings/settings-page.test.tsx`             |

## Shared Component Inventory

### Application Infrastructure Modules

| Module                                                | Responsibility                                                                                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/main.tsx`                               | Composes Redux `Provider`, persisted TanStack Query provider, tooltip provider, browser router, and route tree. |
| `apps/web/src/store.ts`                               | Typed Redux Toolkit store and auth/builder/sidebar/theme slices plus auth thunks.                               |
| `apps/web/src/api/client.ts`                          | Selects mock versus real `ApiClient` using `VITE_USE_MOCK`.                                                     |
| `apps/web/src/api/types.ts`                           | Shared frontend/backend `ApiClient` contract and `ApiError`.                                                    |
| `apps/web/src/api/real/adapter.ts`                    | Axios clients, cookie credentials, route mapping, and error normalization.                                      |
| `apps/web/src/api/mock/adapter.ts`                    | Fixture-backed demo implementation with local persistence for mutable mock data.                                |
| `apps/web/src/api/hooks.ts`                           | TanStack Query reads/mutations, query keys, cache invalidation, and workspace-switch cache clearing.            |
| `apps/web/src/api/query-client.ts`                    | Shared QueryClient and persisted-cache configuration.                                                           |
| `apps/web/src/routes.tsx`                             | Public/protected route tree, session initialization, lazy pages, and not-found redirect.                        |
| `apps/web/src/route-preload.ts` / `route-prefetch.ts` | Lazy-chunk and query prefetching for navigation intent.                                                         |

### Application Shell and Layout

| Component        | Responsibility                                                                                        |
| ---------------- | ----------------------------------------------------------------------------------------------------- |
| `AppShell`       | Authenticated route frame, sidebar/mobile navigation, skip link, and content-scoped suspense.         |
| `Sidebar`        | Desktop navigation rail; reads Redux collapsed state.                                                 |
| `SidebarContent` | Shared desktop/mobile links, workspace switching/creation, theme control, account menu, and sign-out. |
| `MobileTopBar`   | Mobile drawer launcher; closes the drawer after route navigation.                                     |
| `PageHeader`     | Reusable eyebrow/title/description header for workspace pages.                                        |
| `RouteSkeleton`  | Loading placeholder for lazy route content.                                                           |
| `BrandMark`      | Product logo mark.                                                                                    |
| `ProductLabel`   | Compact product name lockup.                                                                          |
| `ThemeToggle`    | Light/dark control; preference is Redux-backed and persisted under `apicem.theme`.                    |

### UI Primitives

| Component(s)                                                                                                                                                                                                                      | Responsibility                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `Button`                                                                                                                                                                                                                          | Variants, sizes, loading state, and optional arrow affordance.           |
| `Input`, `Textarea`, `Label`                                                                                                                                                                                                      | Form controls and label semantics.                                       |
| `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`                                                                                                                                                               | Reusable content framing.                                                |
| `Badge`                                                                                                                                                                                                                           | Compact plan/status/category labels.                                     |
| `Avatar`                                                                                                                                                                                                                          | User initials/avatar-color presentation; has a dedicated component test. |
| `StatusDot`                                                                                                                                                                                                                       | Data-source status marker.                                               |
| `Progress`                                                                                                                                                                                                                        | Usage-limit progress display.                                            |
| `EmptyState`                                                                                                                                                                                                                      | Reusable empty-result presentation.                                      |
| `Separator`                                                                                                                                                                                                                       | Horizontal or vertical divider.                                          |
| `Switch`                                                                                                                                                                                                                          | Radix-backed binary control.                                             |
| `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`                                                                                                                                                                                  | Tab navigation and panels.                                               |
| `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`                                                                                                                    | Accessible modal composition.                                            |
| `ConfirmDialog`                                                                                                                                                                                                                   | Reusable confirmation for destructive actions.                           |
| `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuSub`, `DropdownMenuSubTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuCheckboxItem`, `DropdownMenuLabel`, `DropdownMenuSeparator`, `DropdownMenuSubContent` | Keyboard-accessible menus and submenus.                                  |
| `Popover`, `PopoverTrigger`, `PopoverAnchor`, `PopoverContent`                                                                                                                                                                    | Anchored editor/action panels.                                           |
| `Select`, `SelectValue`, `SelectTrigger`, `SelectContent`, `SelectItem`                                                                                                                                                           | Accessible option selection.                                             |
| `TooltipProvider`, `Tooltip`, `TooltipTrigger`, `TooltipContent`                                                                                                                                                                  | Shared tooltip behavior.                                                 |

### Charts and Data Display

| Component         | Responsibility                                                    |
| ----------------- | ----------------------------------------------------------------- |
| `ChartRenderer`   | Selects KPI, bar, line, or table presentation for a query result. |
| `KpiTile`         | Formatted single value with optional trend series.                |
| `QueryLineChart`  | Recharts line-series renderer.                                    |
| `QueryBarChart`   | Recharts bar-series renderer.                                     |
| `QueryDataTable`  | Tabular result renderer.                                          |
| `ChartTooltip`    | Shared chart tooltip formatting.                                  |
| `ConfidenceBadge` | Query confidence display.                                         |

## Feature Component Inventory

| Feature area   | Components                                                                                                                         | Responsibility                                                                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ask/results    | `ResultPanel`, `StarterQuestionsList`, `SaveExplorationPopover`                                                                    | Result chart/data/SQL tabs; confidence; edit-question, save, report, and experiment actions; suggested prompts; persisted explorations.                |
| Explore fields | `FieldChip`, `Shelf`, `ShelfGroup`, `MultiShelf`, `MetricFilterChips`, `ChartTypeSwitcher`, `PivotTableView`                       | Drag/drop fields; single/multiple metric/dimension shelves; filters; chart selection; pivot result rendering.                                          |
| Reports        | `SaveToReportPopover`                                                                                                              | Append a metric/preset result block to a report.                                                                                                       |
| Report builder | `Canvas`, `StaticCanvas`, `BlockPalette`/`paletteItems`, `BlockFrame`, `BlockContent`, `EditBlockPopover`, `EditPivotBlockPopover` | Editable/static canvases; add, move, resize, select, delete, and configure KPI/chart/table/pivot/text/image/divider blocks. Builder state is in Redux. |
| Experiments    | `CreateExperimentDialog`, `EditExperimentDialog`, `ExperimentStatusBadge`, `ExperimentSummaryList`, `LiftChart`                    | Experiment design/create/edit; lifecycle indicators; compact summaries; treatment/holdout lift charts.                                                 |
| Data sources   | `SourceSummaryList`, `SchemaTablesList`, `SyncHistoryList`                                                                         | Connection summaries; scanned table/column schema; attempt history, row counts, errors, and idempotency keys.                                          |
| Workbooks      | `WorkbookCard`                                                                                                                     | Report/exploration card, owner metadata, and navigation prefetch.                                                                                      |
| Workspaces     | `CreateWorkspaceDialog`                                                                                                            | Create a workspace and return to its main view.                                                                                                        |

### Component Testing Depth

- Dedicated tests exist at `apps/web/src/components/ui/avatar.test.tsx`, `apps/web/src/components/layout/app-shell.test.tsx`, `apps/web/src/features/workbooks/workbook-card.test.tsx`, `apps/web/src/features/workspaces/create-workspace-dialog.test.tsx`, `apps/web/src/stores/builder.test.ts`, `apps/web/src/features/builder/block-content.test.tsx`, `apps/web/src/features/builder/edit-block-popover.test.tsx`, and `apps/web/src/features/builder/edit-pivot-block-popover.test.tsx`.
- Page tests exercise the major flows for Home, Explore, Reports, report builder, Experiments, Connections, Login, Onboarding, and Settings.
- There is not an isolated test for every UI primitive or chart renderer. Remaining test work should focus on independently stateful/permission-sensitive components and real-adapter contracts, rather than duplicating page-level coverage for every wrapper.
- Chart tests currently emit zero-size container warnings in jsdom; verify chart sizing in a browser viewport as part of visual QA.

## Backend API Coverage

### Implemented V1 Routes

- `POST /api/v1/auth/signup`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/me`
- `PATCH /api/v1/me`
- `GET /api/v1/workspace`
- `GET /api/v1/workspace/members`
- `PATCH /api/v1/workspace/members/{user_id}`
- `GET /api/v1/workspaces`
- `POST /api/v1/workspaces/{workspace_id}/switch`
- `POST /api/v1/workspaces`
- `GET /api/v1/data-sources`
- `POST /api/v1/data-sources` (Shopify only)
- `DELETE /api/v1/data-sources/{source_id}`
- `GET /api/v1/data-sources/{source_id}/schema`
- `GET /api/v1/data-sources/{source_id}/sync-runs`
- `POST /api/v1/data-sources/{source_id}/sync`

### Legacy Routes Used by the Adapter

- `PATCH /tenant` for workspace rename
- `POST /auth/request-password-reset`
- `POST /auth/change-password`

These legacy routes accept the session cookie through the existing auth dependency but are outside the `/api/v1` route group.

### Missing Real Data APIs

The frontend real adapter expects these surfaces, but they are not present in backend V1:

- Metrics, starter questions, query execution, pivot query, and report-block data
- Workbook/exploration list/detail/create/delete and view tracking
- Report list/detail/create/update/delete
- Experiment list/detail/create/update/delete and results

Legacy `/connections`, `/dashboards`, and `/metrics` routes exist, but they do not currently satisfy the new frontend's `ApiClient` request/response contract. Implement compatible V1 routes or add explicit adapter mappings before claiming real-data readiness.

## Environment and Run Commands

Current `apps/web/.env.local`:

```dotenv
VITE_USE_MOCK=false
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

With mock mode disabled, missing backend endpoints do not fall back to fixtures; pages that call unsupported routes can show API errors. Set `VITE_USE_MOCK=true` for the fixture-backed demo while backend APIs are being implemented.

From `new_frontend`:

```powershell
npm run dev
npm test
npm run typecheck
npm run lint
npm run build
```

From `backend` with the working Python 3.12 environment and initialized local PostgreSQL:

```powershell
.venv312\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
.venv312\Scripts\python -m pytest tests/ -v
```

## Verification Record

Last implementation-session checks:

- Frontend production build passed.
- Frontend TypeScript typecheck passed after the Home route state handling and test-mode isolation changes.
- Focused suites passed: auth/AppShell (5), onboarding (2), Settings (8), source connection (2), builder state/content (13), block editor (7), and pivot editor (3).
- Lint completed with two warnings in `features/builder/block-palette.tsx` and `features/reports/save-to-report-popover.tsx`.
- The full Vitest run emitted failure markers but did not return a final report in the terminal session; treat the full suite as **not verified** until rerun and failing test names are inspected.
- V1 signup and Shopify-source integration tests now run against the local PostgreSQL setup. The focused auth/connections/V1-source suite passed (16 tests); it covers cookie signup, encrypted Shopify credential mapping, unsupported-source rejection, and idempotent sync requests.
- Settings contract coverage now exercises cookie-authenticated profile and workspace updates plus an admin demotion. The focused auth/connections/V1-source/Settings suite passed (18 tests), confirming the previously-issued admin cookie is rejected immediately after demotion.
- A full backend test run completed with 71 passing and 3 failing assistant API tests. Those failures are caused by the local database lacking `marts.fct_revenue_daily`; initialize/run the warehouse dbt models before treating assistant metric coverage as verified.
- Home's fixture-backed smoke test and workbooks-request failure-state test both pass (2 tests total) with Vitest's mock-mode stub active.

Re-run verification after newer edits. Prioritize real signup/login with PostgreSQL, real-adapter contract tests, then each data-backed route after its backend endpoint is implemented.
