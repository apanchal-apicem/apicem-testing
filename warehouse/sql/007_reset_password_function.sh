#!/bin/bash
# A password reset only carries a user_id (from the reset token), not a tenant_id, so there
# is no tenant context to SET before the update -- the same chicken-and-egg problem
# app.login_lookup solves for login (Sec 006). Same fix: a narrow SECURITY DEFINER function
# that bypasses RLS (as the owning role) but only ever does exactly this one update.
set -e

APICEM_APP_DB_USER="${APICEM_APP_DB_USER:-apicem_app}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    -- LANGUAGE sql has no FOUND (that's PL/pgSQL-only) -- RETURNING doubles as the
    -- existence check: a caller gets zero rows back if p_user_id didn't match anything.
    CREATE FUNCTION app.reset_password(p_user_id uuid, p_hashed_password text)
    RETURNS TABLE(user_id uuid)
    LANGUAGE sql SECURITY DEFINER
    AS \$\$
        UPDATE app.users SET hashed_password = p_hashed_password WHERE user_id = p_user_id
        RETURNING app.users.user_id;
    \$\$;

    REVOKE ALL ON FUNCTION app.reset_password(uuid, text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION app.reset_password(uuid, text) TO ${APICEM_APP_DB_USER};
EOSQL
