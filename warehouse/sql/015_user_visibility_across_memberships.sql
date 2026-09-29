-- Phase 1 follow-up, found via live verification: app.users' original tenant_isolation policy
-- (004_rls.sql) only ever admitted a row where u.tenant_id = the active workspace -- i.e. a
-- user's own "home" tenant. That was correct under the old one-tenant-per-user model, but
-- 014_workspace_memberships.sql's whole point is that a user can now belong to OTHER
-- workspaces too (invited as editor/viewer on someone else's). GET /workspace/members joins
-- app.workspace_memberships to app.users by user_id -- for a non-home member, that join came
-- back empty (not an error, just silently missing rows), because RLS was rejecting the
-- app.users side even though the membership row itself was visible.
--
-- Fix: a user's row is now visible in a workspace either because it's their home tenant, OR
-- because they hold a membership row in the currently active workspace. WITH CHECK (governing
-- INSERT/UPDATE) is untouched -- a user is still only ever *created* under their home tenant,
-- this only widens what can be *read*.
ALTER POLICY tenant_isolation ON app.users
    USING (
        tenant_id = current_setting('app.current_tenant', true)::uuid
        OR EXISTS (
            SELECT 1 FROM app.workspace_memberships m
            WHERE m.user_id = app.users.user_id
              AND m.workspace_id = current_setting('app.current_tenant', true)::uuid
        )
    );
