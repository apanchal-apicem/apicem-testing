# Security

This document is the honest version of "how we keep this secure" — what's
already true, what's a hard requirement for whoever builds the backend, and
what's explicitly not true yet. No system is unhackable; the goal here is to
make the two guarantees that matter most to customers structurally true
(enforced by architecture, not by hoping every code path remembers to check),
and to be upfront about what's still open.

## Tenant isolation — client A can never see client B's rows

**The guarantee:** a request from one workspace can never return another
workspace's data, and nothing about the _content_ of a request — a typed
question, a crafted filter, a prompt-injection attempt against the
natural-language query feature — can change that.

**Why this has to be enforced below the LLM, not by it.** The "Ask" feature
turns a natural-language question into a query. If tenant scoping were
something the model was merely _instructed_ to respect ("only return data for
workspace X"), a sufficiently adversarial question could talk it out of that
instruction — that's a real, demonstrated class of attack against
LLM-mediated data access, not a hypothetical. So the rule is: **the model
never sees or produces anything that includes a workspace/tenant identifier,
and never executes anything with database-level reach.** Concretely, for
whoever builds the backend:

1. The authenticated session (cookie or token) is the _only_ source of the
   current workspace ID, resolved by the backend before any query logic runs.
   No request type in `packages/api-contract` accepts a `workspaceId` field —
   that's deliberate. If a future endpoint needs one, it must come from the
   session, never from the request body, a header, or anything the client
   (or a prompt) supplies.
2. The model's job is narrow: turn a question into a _query spec_ (a metric
   id, dimensions, filters) chosen from an allowlist of the workspace's own
   defined metrics and columns — never raw SQL, never an arbitrary table
   reference. That spec is then executed by ordinary application code that
   already has the workspace ID from the session, not from anything the model
   produced.
3. Defense in depth at the data layer itself: every tenant-scoped table
   carries a `workspace_id`, and the database enforces it independently of
   application code — e.g. Postgres Row-Level Security policies keyed to the
   session's workspace, or an ORM layer that makes an unscoped query a type
   error rather than a runtime possibility. This is the backstop for the case
   where application code has a bug; it must hold even if step 2 didn't.
4. Every fixture and mock response in this repo is already scoped by
   `workspaceId` on the entities that carry one — see `entities.ts`'s header
   comment — so the shapes the frontend expects already model this
   correctly. Copy the shape, not just the field name.

**What this repo can't test yet:** there's no real backend, so there's no
real query executor or database to run row-level-security tests against.
This section is the specification the backend must satisfy, and it should be
the first thing tested (a two-workspace fixture, one query, assert zero
cross-contamination) once it exists. What the mock _can_ and does prove: the
fixture layer models two genuinely separate workspaces (Northwind Outfitters,
Aurora Fitness Co.) with their own sources, metrics, and query engines —
switch workspaces in the app and every number on screen changes, because
they're backed by disjoint data, not a filtered view of one shared set.

## Switching workspaces — a privileged action, not a data query

`switchWorkspace(workspaceId)` is the one place in `ApiClient` a
client-supplied workspace id legitimately crosses the wire — see the header
comment in `entities.ts`. That's a deliberate, narrow exception to the rule
above, not a crack in it: the backend must still independently verify the
session's user is actually a member of that workspace before honoring the
switch, and every _data_ request made afterward goes back to deriving its
scope from the session alone, exactly as before. Creating a workspace
(`createWorkspace`) carries the same obligation, since it also switches the
session into the new workspace.

**The client-side half of this, and a real bug it surfaced:** because
switching changes what almost every cached query means, the frontend clears
its entire query cache on a successful switch or create rather than trying
to invalidate each key individually (`clearWorkspaceScopedCache` in
`api/hooks.ts`) — enumerating "everything scoped to the old workspace" is
exactly the kind of filter that's easy to get subtly wrong, and this is the
one moment wrong is expensive. Building this surfaced a genuine race: the
query cache also persists to `localStorage` on a throttle for fast reloads
(see PERFORMANCE.md), and a switch immediately followed by a reload could
land _before_ that throttle flushed the cleared state — the reload would
then restore the _previous_ workspace's still-on-disk snapshot, which reads
as fresh for whatever's left of its `staleTime`. Confirmed by reproducing it
with a real switch-then-reload. The fix calls the persister's `removeClient`
synchronously in the same success handler, so a reload right after switching
finds nothing stale to restore rather than racing a timer. Worth internalizing
past this specific bug: client-side caching and multi-tenancy compose in ways
that are easy to get wrong on the first pass, precisely because most caching
logic is written assuming "the data" has one meaning for the whole session.

**A second bug this surfaced, found by an automated test rather than by
clicking through the UI:** the mock's `switchWorkspace` was written to reject
an id for a workspace the user isn't a member of — but the lookup it checked
(`fixtures.ts`'s `getBundle`) silently fell back to the default workspace for
_any_ unrecognized id, a leftover from the single-workspace era before this
fell back to "the only workspace" was harmless. That made the membership
check unreachable: every id "existed," so nothing was ever rejected. A test
asserting that a garbage workspace id gets a 403 caught it (`adapter.test.ts`,
"rejects switching to a workspace id that isn't a real membership"), because
that's exactly the kind of case a person testing by hand never types by
accident. Fixed by making the lookup return nothing for an unknown id, and
moving "recover to the default" to the one call site (recovering a corrupted
persisted active-workspace id on load) that actually means it. The takeaway
generalizes past this bug too: a silent fallback anywhere in a lookup that a
security check also depends on can quietly disable that check, and the
disabling won't show up in normal use — only in a test (or an attacker)
that tries the case normal use never does.

## Idempotent sync runs — a fixed-and-retried job never duplicates rows

**The guarantee:** if a data source sync fails partway through, fixing the
bug and re-running it lands on the source's true row count — it never adds a
second copy of what the failed attempt already wrote.

**How:** every sync run carries an `idempotencyKey` (see `SyncRun` in
`entities.ts`). A retry of a failed run reuses the _same_ key. The backend's
sync job upserts each row on its natural key (e.g. the source system's own
`order_id`, `event_id`) rather than blindly inserting — so writing the same
row twice under the same key is a no-op, not a duplicate. This is why
`rowsUpserted` on a successful retry reflects the source's actual row count,
not the sum of every attempt. The frontend's Connections → Sync history view
makes this visible on purpose: attempt 1 fails partway (rows upserted so
far), attempt 2 succeeds and lands on the true total, same idempotency key
both times.

The one thing to also guard at the HTTP layer: a user double-clicking retry,
or a network-level retry of the _request itself_, shouldn't kick off two
independent sync jobs. `src/api/real/adapter.ts`'s `retrySync` sends a
client-generated `Idempotency-Key` header per click for exactly this reason —
the backend should treat two requests with the same key (within a
reasonable window) as one logical attempt.

## Credential handling

Source connection credentials (API keys, passwords) live only in transient
React state in the connect-source flow (`connect-source-page.tsx`) for as
long as the form is open — never written to `localStorage`, never included
in the `DataSource` type the API returns (check `entities.ts`: there's no
credentials field on the read side, by design), so there's no shape for a
response to accidentally echo one back in. The mock adapter demonstrates
this: it accepts credentials on `createDataSource` and discards them
immediately rather than storing them in its (localStorage-backed) mock
state. The real backend must encrypt them at rest and never return them in
any response — including error messages.

## What's already true

- **Zero known dependency vulnerabilities**, enforced on every push and PR to
  `main` by `.github/workflows/ci.yml` (`npm audit --audit-level=high`
  alongside typecheck, lint, the test suite, and a production build) — not
  just true as of one manual review that can silently go stale.
- **No unsafe DOM sinks anywhere in the app** — no `dangerouslySetInnerHTML`,
  `eval`, or `innerHTML` assignment. React's default escaping handles all
  user-rendered text.
- **Every write request is zod-validated** at the type boundary
  (`packages/api-contract/src/requests.ts`) — the backend should run the same
  parse server-side rather than trusting that the frontend's validation ran.
- **Report block configs are structurally typed**, not free-form strings
  evaluated at render time — a saved block re-resolves its data through
  `getBlockData(source, key)` against an allowlist of known keys, not by
  re-running arbitrary stored logic.
- **Role is modeled per-workspace membership, not globally on the user** —
  `WorkspaceSummary.myRole` is separate from `Workspace`/`User`, because the
  same person can legitimately be the owner of their own workspace and an
  invited admin or editor on someone else's. A backend that instead stores
  "this user's role" as one global field will eventually get this wrong the
  moment a single account belongs to more than one workspace.

## What's explicitly not true yet

- **Cookie authentication is implemented for the new frontend.** Signup,
  sign-in, sign-out, and session lookup use the V1 auth routes; the backend
  issues an `httpOnly`, `SameSite=Lax` session cookie and the frontend never
  stores the token in `localStorage`. The `Secure` flag is disabled only for
  local HTTP development and must be enabled behind HTTPS before deployment.
  The mock adapter's local sign-in flag is demo-only and is not an auth
  boundary.
- **Settings writes use session-scoped backend routes.** Profile names,
  workspace names, password changes, and membership role changes are
  persisted. Role authorization is enforced server-side; UI-disabled
  controls are only a usability layer, never the security boundary.
- **No Content-Security-Policy or security headers yet**, because those
  belong at the hosting/CDN layer for a static SPA, not baked into
  `index.html` (a meta-tag CSP shared between dev and prod risks breaking
  Vite's dev server for no real protection, since the threat model is the
  deployed app, not localhost). Before production launch, set at minimum:
  `Content-Security-Policy` (default-src 'self'; connect-src limited to the
  API origin; no unsafe-inline for scripts), `Strict-Transport-Security`,
  `X-Content-Type-Options: nosniff`, and `X-Frame-Options: DENY` (or an
  equivalent `frame-ancestors 'none'` in the CSP) at the CDN/reverse-proxy
  config.
- **No rate limiting on the query endpoint.** Once a real LLM-backed `/query`
  endpoint exists, it's both a cost surface and an abuse surface (a
  prompt-injection attempt that can't escalate privilege can still try to
  burn budget or extract information via many small queries) — this needs
  per-workspace and per-user rate limits at the backend, out of scope for
  this frontend repo but flagged so it isn't forgotten.

## Reporting

This is a pre-launch demo product with no production users yet. If you find
something here, open an issue in this repo rather than disclosing publicly.
