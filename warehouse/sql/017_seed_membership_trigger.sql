-- Phase 1 follow-up: 014_workspace_memberships.sql's backfill only covered users that already
-- existed AT MIGRATION TIME. Any user created afterwards through the OLD frontend's flows
-- (signup, team invite -- routers/auth.py, routers/team.py) got an app.users row but no
-- matching app.workspace_memberships row, so the new frontend's GET /me, /workspace, etc.
-- would 500 (.one() against zero rows) for them. Teaching every INSERT INTO app.users call
-- site about workspace_memberships is the same mistake 016 just fixed for slug -- instead,
-- an AFTER INSERT trigger seeds the membership automatically, wherever the insert came from.
--
-- No SECURITY DEFINER needed: every existing INSERT INTO app.users path already has to set
-- app.current_tenant = NEW.tenant_id beforehand (app.users' own tenant_isolation WITH CHECK
-- requires it), so by the time this trigger fires, workspace_memberships' own WITH CHECK
-- (workspace_id = app.current_tenant) is already satisfied under the same apicem_app role.
CREATE OR REPLACE FUNCTION app.seed_workspace_membership() RETURNS trigger AS $$
BEGIN
    INSERT INTO app.workspace_memberships (user_id, workspace_id, role)
    VALUES (NEW.user_id, NEW.tenant_id, NEW.role)
    ON CONFLICT (user_id, workspace_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_seed_membership ON app.users;
CREATE TRIGGER users_seed_membership
    AFTER INSERT ON app.users
    FOR EACH ROW EXECUTE FUNCTION app.seed_workspace_membership();
