-- Phase 1 follow-up, found via live verification: making app.tenants.slug NOT NULL
-- (014_workspace_memberships.sql) broke the OLD frontend's signup flow (routers/auth.py),
-- which only ever inserted (name) -- confirmed live, a 500 with a NotNullViolation.
--
-- Rather than teaching every INSERT INTO app.tenants call site (old signup, new
-- POST /workspaces, and whatever comes next) to compute a slug itself, this puts the
-- invariant where it can't be forgotten: a BEFORE INSERT trigger fills slug in whenever
-- it's left NULL, using the same name-derived-plus-id-suffix scheme as the migration's own
-- backfill. Consistent with this app's existing pattern of enforcing cross-cutting rules at
-- the DB layer (RLS, dbt's apply_rls post-hook) rather than scattering them across app code.
CREATE OR REPLACE FUNCTION app.set_tenant_slug() RETURNS trigger AS $$
BEGIN
    IF NEW.slug IS NULL THEN
        NEW.slug := lower(regexp_replace(regexp_replace(NEW.name, '[^a-zA-Z0-9]+', '-', 'g'), '^-+|-+$', '', 'g'))
                     || '-' || substr(NEW.tenant_id::text, 1, 8);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tenants_set_slug ON app.tenants;
CREATE TRIGGER tenants_set_slug
    BEFORE INSERT ON app.tenants
    FOR EACH ROW EXECUTE FUNCTION app.set_tenant_slug();
