-- Phase 1 bug fix, found via live verification: app.current_user_id is a Postgres "placeholder"
-- custom GUC (like app.current_tenant always was) -- but unlike app.current_tenant, it is NOT
-- set on every request that touches an RLS-protected table (e.g. the OLD frontend's /auth/me
-- only ever calls set_tenant, never set_current_user). The first time ANY request on a given
-- pooled connection calls SET LOCAL app.current_user_id, Postgres creates a placeholder for
-- the rest of that connection's life; once the LOCAL scope ends (commit/rollback), the
-- variable's value reverts not to NULL but to '' (empty string) -- current_setting(..., true)
-- then returns '' instead of NULL for every later request that reuses the same pooled
-- connection without setting it again. ''::uuid throws (confirmed live: a 500 on /auth/me,
-- intermittent depending on which pooled connection got reused, immediately after any request
-- that had called set_current_user).
--
-- Fix: NULLIF(..., '') before the cast, so an unset-this-transaction value reads as NULL (no
-- membership match, fails closed) instead of throwing. app.current_tenant doesn't need the
-- same guard -- every single access path already calls set_tenant() immediately before any
-- protected-table read, so it's never left resting on its post-reset '' value.
ALTER POLICY membership_visibility ON app.workspace_memberships
    USING (
        user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
        OR workspace_id = current_setting('app.current_tenant', true)::uuid
    );
