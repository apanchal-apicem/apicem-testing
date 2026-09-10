-- Ask Apicem Engine's chat history used to live only in the browser's React state -- gone on
-- refresh, on navigating away, or on logging back in. Persisted per-user (not shared across a
-- tenant's whole team, same as any other personal chat history) so each person's questions
-- stay theirs; the backend also explicitly filters by user_id on top of this table's RLS,
-- matching the app's existing defense-in-depth pattern (RLS is tenant-scoped only, same as
-- every other app.* table -- user-level scoping is an application-layer filter, same as how
-- app.users itself is visible tenant-wide by RLS but the Team page's own logic decides what to
-- show).
CREATE TABLE app.assistant_messages (
    message_id  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   uuid NOT NULL REFERENCES app.tenants(tenant_id) ON DELETE CASCADE,
    user_id     uuid NOT NULL REFERENCES app.users(user_id) ON DELETE CASCADE,
    role        text NOT NULL CHECK (role IN ('user', 'assistant')),
    content     text NOT NULL,
    -- The same AssistantMetricResult[] shape /assistant/ask already returns -- stored as-is so
    -- a reloaded history can still render the KpiTile/TrendChart/MetricTable under a past
    -- answer, not just its text.
    results     jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_assistant_messages_tenant_user ON app.assistant_messages(tenant_id, user_id, created_at);

ALTER TABLE app.assistant_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app.assistant_messages
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
