#!/bin/bash
# Least-privilege grants for the backend's apicem_app role (doc Sec 11): full read/write on
# its own control-plane tables (RLS-scoped), read-only on marts (RLS-scoped), and no access
# at all to raw/staging -- only the orchestrator's owner role touches those.
set -e

APICEM_APP_DB_USER="${APICEM_APP_DB_USER:-apicem_app}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    GRANT USAGE ON SCHEMA app TO ${APICEM_APP_DB_USER};
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO ${APICEM_APP_DB_USER};
    ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA app
        GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${APICEM_APP_DB_USER};

    GRANT USAGE ON SCHEMA marts TO ${APICEM_APP_DB_USER};
    ALTER DEFAULT PRIVILEGES FOR ROLE ${POSTGRES_USER} IN SCHEMA marts
        GRANT SELECT ON TABLES TO ${APICEM_APP_DB_USER};
EOSQL
