-- Application / control-plane tables (architecture doc Sec 1.1, 2.2, 6).

CREATE TABLE app.tenants (
    tenant_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    plan        text NOT NULL DEFAULT 'trial',
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- email is globally unique (one login identity maps to exactly one tenant in the MVP) so
-- login can resolve a tenant from just an email address via app.login_lookup (Sec 006).
CREATE TABLE app.users (
    user_id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES app.tenants(tenant_id) ON DELETE CASCADE,
    email           text NOT NULL UNIQUE,
    hashed_password text NOT NULL,
    role            text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin', 'viewer')),
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Secrets: connections reference a secret by id, never store credentials inline (doc Sec 2.2, 11).
-- MVP uses application-level Fernet envelope encryption in place of AWS Secrets Manager/Vault.
CREATE TABLE app.secrets (
    secret_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES app.tenants(tenant_id) ON DELETE CASCADE,
    ciphertext  bytea NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app.connections (
    connection_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid NOT NULL REFERENCES app.tenants(tenant_id) ON DELETE CASCADE,
    source_type     text NOT NULL CHECK (source_type IN ('shopify')),
    secret_ref      uuid REFERENCES app.secrets(secret_id),
    status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'error', 'disabled')),
    use_mock_data   boolean NOT NULL DEFAULT false,
    last_synced_at  timestamptz,
    sync_cursor     text,
    last_error      text,
    requested_sync_at timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- One row per sync/dbt run, surfaced by the "data health" panel (doc Sec 7.3). tenant_id is
-- nullable because dbt "transform" runs build shared marts across all tenants at once and
-- are not a single tenant's event; per-connection "extract" runs always carry a tenant_id.
CREATE TABLE app.job_runs (
    job_run_id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       uuid REFERENCES app.tenants(tenant_id) ON DELETE CASCADE,
    -- SET NULL (not CASCADE): job history is an audit trail (doc Sec 11) that should
    -- survive removing the connection it came from, just detached from it.
    connection_id   uuid REFERENCES app.connections(connection_id) ON DELETE SET NULL,
    job_type        text NOT NULL CHECK (job_type IN ('extract', 'transform')),
    status          text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'success', 'failed')),
    started_at      timestamptz NOT NULL DEFAULT now(),
    finished_at     timestamptz,
    error_message   text
);

CREATE INDEX idx_users_tenant ON app.users(tenant_id);
CREATE INDEX idx_connections_tenant ON app.connections(tenant_id);
CREATE INDEX idx_job_runs_tenant ON app.job_runs(tenant_id);
