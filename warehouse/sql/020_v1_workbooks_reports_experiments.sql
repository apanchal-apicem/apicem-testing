-- 020_v1_workbooks_reports_experiments.sql
-- Tables supporting the new frontend's Workbooks, Reports, and Experiments pages.
-- Adheres to the multi-tenant architecture with tenant RLS isolation and apicem_app grants.

CREATE TABLE IF NOT EXISTS app.workbooks (
    workbook_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES app.tenants(tenant_id) ON DELETE CASCADE,
    name        text NOT NULL,
    folder      text,
    kind        text NOT NULL DEFAULT 'workbook' CHECK (kind IN ('workbook', 'report')),
    owner_id    uuid REFERENCES app.users(user_id) ON DELETE SET NULL,
    views       integer NOT NULL DEFAULT 0,
    query       jsonb,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.reports (
    report_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES app.tenants(tenant_id) ON DELETE CASCADE,
    name        text NOT NULL,
    description text,
    folder      text,
    owner_id    uuid REFERENCES app.users(user_id) ON DELETE SET NULL,
    views       integer NOT NULL DEFAULT 0,
    blocks      jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS app.experiments (
    experiment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id     uuid NOT NULL REFERENCES app.tenants(tenant_id) ON DELETE CASCADE,
    name          text NOT NULL,
    hypothesis    text NOT NULL,
    metric_id     text NOT NULL,
    unit_type     text NOT NULL CHECK (unit_type IN ('geo', 'customer_segment')),
    treatment     jsonb NOT NULL,
    holdout       jsonb NOT NULL,
    start_date    timestamptz NOT NULL,
    end_date      timestamptz NOT NULL,
    status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'running', 'completed')),
    owner_id      uuid REFERENCES app.users(user_id) ON DELETE SET NULL,
    result        jsonb,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Indexes for tenant lookups
CREATE INDEX IF NOT EXISTS idx_workbooks_tenant ON app.workbooks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reports_tenant ON app.reports(tenant_id);
CREATE INDEX IF NOT EXISTS idx_experiments_tenant ON app.experiments(tenant_id);

-- Row-Level Security
ALTER TABLE app.workbooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.workbooks
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE app.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.reports
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE app.experiments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.experiments
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- Permissions for the backend app role
GRANT SELECT, INSERT, UPDATE, DELETE ON app.workbooks TO apicem_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.reports TO apicem_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.experiments TO apicem_app;
