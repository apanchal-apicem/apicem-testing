#!/bin/bash
# Login has to find a user by email before any tenant is known, but app.users' RLS policy
# (Sec 004) hides every row until app.current_tenant is set -- a chicken-and-egg problem.
# A narrow SECURITY DEFINER function is the standard fix: it runs with the owning role's
# privileges (which bypass RLS as table owner) but only ever exposes the four auth-relevant
# columns for one email, never a general escape hatch to the full table.
set -e

APICEM_APP_DB_USER="${APICEM_APP_DB_USER:-apicem_app}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE FUNCTION app.login_lookup(p_email text)
    RETURNS TABLE(user_id uuid, tenant_id uuid, hashed_password text, role text)
    LANGUAGE sql SECURITY DEFINER
    AS \$\$
        SELECT user_id, tenant_id, hashed_password, role
        FROM app.users
        WHERE email = p_email;
    \$\$;

    REVOKE ALL ON FUNCTION app.login_lookup(text) FROM PUBLIC;
    GRANT EXECUTE ON FUNCTION app.login_lookup(text) TO ${APICEM_APP_DB_USER};
EOSQL
