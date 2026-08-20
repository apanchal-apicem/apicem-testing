# Apicem Analytics Platform — MVP

A runnable local implementation of the architecture in `smb-analytics-platform-architecture.md`,
scoped to a single connector (Shopify) end-to-end: raw landing → dbt staging/marts → a
tenant-scoped metrics API → a React dashboard. See "Deviations from the full architecture doc"
below for what's simplified vs. the long-term design.

## Stack

| Layer | What's here |
|---|---|
| Warehouse | Postgres 16 (raw / staging / intermediate / marts schemas, one instance for app + warehouse per doc Sec 4.4) |
| Connector | `connectors/shopify` — real Shopify Admin REST client (cursor pagination, backoff, incremental sync) **and** a mock-data generator so the pipeline runs with zero external setup |
| Orchestration | `orchestrator/scheduler.py` — polls for due syncs, runs the connector, then triggers dbt. Stands in for Dagster (doc Sec 3.2) |
| Transformation | `warehouse/dbt` — staging → intermediate → marts, dbt tests, RLS re-applied to every mart via a post-hook |
| Multi-tenancy | Shared tables + `tenant_id` + Postgres RLS (doc Sec 6.2), enforced via a two-role setup (see below) |
| Backend | `backend` — FastAPI, JWT auth, an in-house metric registry standing in for MetricFlow/Cube.dev |
| Frontend | `frontend` — React + TypeScript + Recharts, Executive Overview + Revenue dashboards |

## Running it locally (no Docker) -- the primary supported path right now

One-time setup, then three terminals. `.env` (copy from `.env.example`) is auto-loaded by
every service now, so no manually-exported environment variables are needed to start any
of them -- this was real, repeated friction earlier on and is now fixed.

```bash
cp .env.example .env
# Generate a real Fernet key (required even for mock connections, since the code path is
# shared) and paste it into .env's FERNET_KEY:
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

# One Postgres 17+ instance, locally installed, with the app schema/roles set up:
# 1) create role `apicem` (owner) and `apicem_app` (RLS-restricted), and a database `apicem`
#    owned by `apicem` -- see warehouse/sql/000_create_app_role.sh's header comment for the
#    exact psql commands (it's written for docker-entrypoint-initdb.d, but every statement
#    in 000-007 runs fine by hand against a plain local Postgres too).
# 2) run warehouse/sql/001 through 007 in order against that database as the `apicem` role.
```

Terminal 1 — backend:
```bash
cd backend
python -m venv .venv && .venv/Scripts/pip install -r requirements.txt   # first time only
.venv/Scripts/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Terminal 2 — orchestrator (polls for due syncs, runs the connector, then dbt):
```bash
cd orchestrator
python -m venv .venv && .venv/Scripts/pip install -r requirements.txt   # first time only
.venv/Scripts/python scheduler.py
```

Terminal 3 — frontend:
```bash
cd frontend
npm install   # first time only
npm run dev
```

- Frontend: http://localhost:5173
- Backend API docs: http://localhost:8000/docs

**Do not run the backend with `--reload` on Windows in this setup** -- on this stack,
`uvicorn --reload`'s worker-respawn mechanism re-executes under a *different* Python
install than the one that started it, silently losing environment variables (this is how
`FERNET_KEY` kept appearing "unconfigured" during development even after setting it). Plain
`uvicorn` without `--reload` is unaffected; just restart it by hand after backend code changes.

First run: sign up (creates a tenant), go to **Connections**, connect Shopify with
"Use sample data" checked. The orchestrator picks up the new connection within ~30 seconds,
lands 250 synthetic orders into `raw.shopify_orders`, then runs `dbt run && dbt test` to build
the marts. Refresh the Executive Overview / Revenue / Product Performance dashboards once
that finishes (watch the connection's status pill on the Connections page go from "pending"
to "active", or check the orchestrator terminal's log output directly).

To connect a **real** Shopify store instead: uncheck "Use sample data" and provide the shop
domain + an Admin API access token with `read_orders`, `read_customers`, `read_products`
scopes. The first sync only fetches `SHOPIFY_INITIAL_BACKFILL_DAYS` (default 365, `.env`
default 90 for faster local testing) of history rather than a real store's entire lifetime --
see "Deviations" below.

## Running it with Docker instead

```bash
docker compose up --build
```
Same URLs as above; `POSTGRES_HOST` is overridden to the `postgres` service name automatically
for containers regardless of what's in `.env`. This path is less exercised right now than the
local one above -- the architecture doc's original target, but local-first was the deliberate
choice while the product itself was still changing quickly.

## Running the test suite

```bash
cd backend
.venv/Scripts/pip install -r requirements-dev.txt   # first time only
.venv/Scripts/pytest tests/ -v
```

Runs against the real local Postgres (not mocks) -- this app's actual bugs so far have all
been in RLS/grants/SQL, which a mocked DB layer would never catch. Every test creates its own
disposable, clearly-tagged tenant and deletes it in teardown; nothing here touches real data.
`tests/test_rls_isolation.py` is the single most important file in the suite: it proves one
tenant's token can never see another tenant's rows, which is the property this entire
multi-tenancy model depends on.

## Two-role RLS setup

Table owner (`POSTGRES_USER`, used by dbt/the orchestrator) bypasses RLS by default — required,
since dbt builds shared mart tables across every tenant in one run. `apicem_app` (used only by
the backend) is a non-owner role, so Postgres always subjects it to the `tenant_isolation`
policies regardless. See `warehouse/sql/000_create_app_role.sh` through `006_login_lookup.sh`
for the full setup, including the `SECURITY DEFINER` function that lets login resolve a tenant
from an email address before any tenant context exists.

## Re-running dbt / inspecting the warehouse manually

```bash
docker compose exec orchestrator dbt run --project-dir /dbt --profiles-dir /dbt
docker compose exec postgres psql -U apicem -d apicem -c "select * from marts.fct_revenue_daily limit 10;"
```

## Deviations from the full architecture doc (and what "next" looks like)

These are intentional MVP simplifications, not oversights — each maps to a specific doc section:

- **No Airbyte / Dagster.** `orchestrator/scheduler.py` is a ~100-line poll loop. Swapping in
  Dagster later means wrapping the same `sync_connection()` and `run_dbt_build()` calls as
  software-defined assets (doc Sec 3.2) — the connector and dbt project don't change.
- **One connector (Shopify).** Adding Google Ads/Meta Ads/NetSuite means a new `connectors/<source>`
  module plus staging models mapping into the same canonical `fct_orders`/`dim_customer` shape
  (doc Sec 5.4) — nothing about the marts layer or API changes.
  `backend/app/dashboard_registry.py`'s `SOURCE_CAPABILITIES` map is where a new source's
  dashboards get unlocked.
  - `dim_customer`/`dim_product` are type-1 (always-current) rather than full SCD2. Upgrading
  means adding a dbt snapshot on `int_customers__unified` — the mart's column shape already
  matches the doc's SCD2 schema (Sec 5.2).
- **Secrets are Fernet-encrypted in Postgres**, not AWS Secrets Manager/Vault (doc Sec 2.2, 11).
  Same envelope-encryption shape, different KMS.
- **In-house metric registry** (`backend/app/metric_registry.py`) instead of dbt MetricFlow/Cube.dev
  (doc Sec 8.2, 9) — the doc explicitly calls this an acceptable MVP starting point.
- **In-house JWT auth** instead of Auth0/Clerk (doc Sec 9) — swap `backend/app/security.py`'s
  token issuance for a managed provider's when you need SSO/MFA.
- **"Sync now" is a polled flag column**, not Redis/Celery/BullMQ (doc Sec 9's job-queue row) —
  fine at MVP volume, becomes a real queue once poll latency matters.
- **A connection's first sync is bounded to `SHOPIFY_INITIAL_BACKFILL_DAYS`** (orders and
  customers; products are intentionally never bounded -- an old product can still be
  actively selling today). A real store with years of history will still be missing older
  customer linkage for orders that predate the window until that customer orders again.
  Raising the bound (or fetching unbounded, accepting the wait) is a config change, not code.

## Path to a sellable, client-hosted product

Discussed as a CEO-level gap review, not implemented yet (deliberately staying local-only
until the product itself is feature-complete -- see below for what's already closed):

**Blocking, before any real client:**
- Actual hosting (AWS per the doc, or a simpler managed platform), a domain, HTTPS, managed
  Postgres with backups -- right now this runs on one machine's Postgres install with none.
- Billing (Stripe) -- `app.tenants.plan` exists and is completely unread.
- Real email delivery -- `backend/app/email.py`'s SMTP path is wired but has never sent a
  real message; there's no provider configured.
- Secrets management for real -- a rotated `FERNET_KEY` in an actual secrets store, never
  hand-typed or pasted anywhere again.
- Terms of Service + Privacy Policy (draftable now, needs real legal review before go-live).

**Closed since the gap review, runnable locally today:**
- ~~Zero automated tests~~ → `backend/tests/`, run via `pytest` (see above).
- ~~No rate limiting on auth~~ → `backend/app/rate_limit.py`, applied to signup/login/
  password-reset-request.
- ~~No password reset~~ → full flow in `backend/app/routers/auth.py`, emails logged to the
  console in dev (see `backend/app/email.py`).
- ~~Orchestrator has no resilience~~ → a DB outage during polling logs and retries next
  cycle instead of crashing the whole process.
- ~~Every terminal restart needed 7 manually-retyped env vars~~ → `.env` is auto-loaded by
  both the backend and the orchestrator now.

**Still open, needed soon (not blocking to keep building locally):**
- Error tracking (Sentry or similar) -- pipeline/API failures are currently only visible if
  someone happens to look at a terminal or the in-app data-health panel.
- CI (needs a git remote first -- this repo has no git history yet).
- SOC 2 groundwork, audit logging, usage-based plan limits, guided onboarding polish.
