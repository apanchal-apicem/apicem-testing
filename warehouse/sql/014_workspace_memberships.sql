-- Backend-for-new-frontend Phase 1: the new frontend's workspace switcher needs a real
-- many-to-many membership model. Old model was 1 tenant : N users, one global role column
-- per user (app.users.role). New model lets one person own their own workspace AND be an
-- invited editor on someone else's -- role is per-membership, not global (see
-- packages/api-contract's Role type and WorkspaceSummary.myRole).

-- slug: url-safe workspace identifier for the new frontend's Workspace.slug field. Derived
-- from name; the tenant_id suffix makes uniqueness trivial without any collision-retry logic.
ALTER TABLE app.tenants ADD COLUMN IF NOT EXISTS slug text;

UPDATE app.tenants t
SET slug = sub.slug
FROM (
    SELECT tenant_id,
           lower(regexp_replace(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'), '^-+|-+$', '', 'g'))
           || '-' || substr(tenant_id::text, 1, 8) AS slug
    FROM app.tenants
) sub
WHERE t.tenant_id = sub.tenant_id AND t.slug IS NULL;

ALTER TABLE app.tenants ALTER COLUMN slug SET NOT NULL;
ALTER TABLE app.tenants ADD CONSTRAINT tenants_slug_key UNIQUE (slug);

CREATE TABLE IF NOT EXISTS app.workspace_memberships (
    membership_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES app.users(user_id) ON DELETE CASCADE,
    workspace_id  uuid NOT NULL REFERENCES app.tenants(tenant_id) ON DELETE CASCADE,
    role          text NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, workspace_id)
);

-- Backfill: every existing user gets one membership in their own tenant, role carried over
-- as-is (app.users.role only ever had owner/admin/viewer, all valid members of the new enum).
INSERT INTO app.workspace_memberships (user_id, workspace_id, role)
SELECT user_id, tenant_id, role FROM app.users
ON CONFLICT (user_id, workspace_id) DO NOTHING;

-- RLS: this table needs to answer two different questions depending on the endpoint --
-- "which workspaces am I a member of" (GET /workspaces, scoped by app.current_user, NOT by
-- the active tenant) and "who else is in my active workspace" (GET /workspace/members,
-- scoped by app.current_tenant). A single app.current_tenant condition can't express the
-- first one, so this policy OR's both session variables together; the app-layer query for
-- each endpoint adds its own WHERE clause on top to get the narrower, correct result --
-- this policy is strictly a backstop ceiling (doc Sec 6.2), not the sole enforcement.
-- Named app.current_user_id, not app.current_user -- Postgres reserves "current_user" as a
-- keyword/builtin, which a custom GUC of that exact name collides with at parse time
-- ("syntax error at or near current_user" on `SET LOCAL app.current_user = ...`, confirmed live).
-- user_id side uses NULLIF(..., '') before the cast: app.current_user_id is not set on every
-- request path (unlike app.current_tenant), so on a reused pooled connection it can rest at
-- Postgres's placeholder-GUC post-reset value of '' rather than NULL -- see
-- 018_fix_current_user_id_cast.sql for the full story (found via live verification).
ALTER TABLE app.workspace_memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY membership_visibility ON app.workspace_memberships
    USING (
        user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        OR workspace_id = current_setting('app.current_tenant', true)::uuid
    )
    WITH CHECK (
        workspace_id = current_setting('app.current_tenant', true)::uuid
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON app.workspace_memberships TO apicem_app;
