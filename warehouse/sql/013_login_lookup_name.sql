-- Extends app.login_lookup (006_login_lookup.sh) to also return `name`, needed for the new
-- frontend's User shape. Safe to append: every existing caller destructures by column NAME
-- (SQLAlchemy Row access, e.g. row.user_id/row.hashed_password), never by position, so adding
-- one more named column breaks nothing already using this function.
--
-- Postgres won't let CREATE OR REPLACE change a function's RETURNS TABLE shape (the OUT
-- parameter row type differs) -- DROP + CREATE is required, which does NOT preserve grants
-- the way a same-signature REPLACE would, so the REVOKE/GRANT from 006_login_lookup.sh is
-- reapplied explicitly below rather than assumed to still be in effect.
DROP FUNCTION IF EXISTS app.login_lookup(text);

CREATE FUNCTION app.login_lookup(p_email text)
RETURNS TABLE(user_id uuid, tenant_id uuid, hashed_password text, role text, name text)
LANGUAGE sql SECURITY DEFINER
AS $$
    SELECT user_id, tenant_id, hashed_password, role, name
    FROM app.users
    WHERE email = p_email;
$$;

REVOKE ALL ON FUNCTION app.login_lookup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.login_lookup(text) TO apicem_app;
