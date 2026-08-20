-- Row-Level Security: enforced at the database layer, in addition to application-layer
-- tenant scoping (defense in depth, architecture doc Sec 6.2, 11).
--
-- Tables are owned by the init/dbt role (POSTGRES_USER). Table owners bypass RLS by default,
-- which is required here: dbt and the orchestrator build/populate shared mart and raw tables
-- across ALL tenants in a single run, so they must NOT be tenant-filtered. The backend API
-- connects as `apicem_app`, a non-owner role, which Postgres always subjects to RLS policies
-- regardless of who owns the table -- no FORCE ROW LEVEL SECURITY is needed or wanted here.
--
-- The API sets `SET app.current_tenant = '<tenant_uuid>'` per request; a missing setting
-- resolves to NULL, which matches no rows, i.e. RLS fails closed by default.

ALTER TABLE app.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.users
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE app.secrets ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.secrets
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE app.connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.connections
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE app.job_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.job_runs
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- app.tenants intentionally has no RLS: it is the tenant registry itself, read/written
-- cross-tenant by the signup/bootstrap path (before a tenant context exists) and admin tooling.

-- Note: dbt-materialized tables in the `marts` schema get the same policy applied via a
-- post-hook macro (see warehouse/dbt/macros/apply_rls.sql) since dbt drops/recreates those
-- tables on every run and a static CREATE POLICY here would be dropped along with them.
