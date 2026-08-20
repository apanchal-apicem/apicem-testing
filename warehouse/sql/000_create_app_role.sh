#!/bin/bash
# Two-role RLS setup: the owner role (POSTGRES_USER, used by dbt/orchestrator) creates and
# owns every table and bypasses RLS by default -- required, since dbt builds shared mart
# tables across ALL tenants in one run. apicem_app (used only by the backend API) is a
# non-owner role, so it is always subject to RLS policies with no special-casing needed.
set -e

APICEM_APP_DB_USER="${APICEM_APP_DB_USER:-apicem_app}"
APICEM_APP_DB_PASSWORD="${APICEM_APP_DB_PASSWORD:-apicem_app_dev_password}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE ROLE ${APICEM_APP_DB_USER} LOGIN PASSWORD '${APICEM_APP_DB_PASSWORD}';
EOSQL
