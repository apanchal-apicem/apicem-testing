"""Lightweight stand-in for Dagster (doc Sec 3.2, 9): polls for connections due a sync
(scheduled cadence or a user-triggered "sync now"), extracts, then runs dbt if anything
changed. Runs as the Postgres owner role, so it sees all tenants without needing to set a
per-tenant RLS session variable.
"""
import importlib.util
import logging
import os
import sys
import time

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

# Load the repo-root .env into this process's environment BEFORE anything below reads
# os.environ -- in Docker, docker-compose's env_file already provides these, so a missing
# .env file here (find_dotenv returns nothing) is expected and harmless there.
_REPO_ROOT_ENV = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env")
load_dotenv(dotenv_path=_REPO_ROOT_ENV)

from dbt_runner import run_dbt_build  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("orchestrator")

POLL_INTERVAL_SECONDS = 30
SYNC_INTERVAL_MINUTES = int(os.environ.get("SYNC_INTERVAL_MINUTES", "15"))

# Per-plan sync-frequency quota (doc Sec 9 update, 2026-08-19): app.tenants.plan has existed
# since the MVP but was never read anywhere -- every tenant synced on the same global
# SYNC_INTERVAL_MINUTES regardless of plan. Any plan value not listed here (including a
# future/unrecognized one) falls back to SYNC_INTERVAL_MINUTES, so this is additive --
# nothing changes for anyone until a tenant's plan is actually set to one of these.
PLAN_SYNC_INTERVAL_MINUTES = {"trial": 60, "starter": 30, "growth": 15}

CONNECTION_COLUMNS = [
    "connection_id", "tenant_id", "source_type", "secret_ref",
    "use_mock_data", "sync_cursor", "last_synced_at", "requested_sync_at",
]

# In Docker, connectors are bind-mounted at /connectors (see docker-compose.yml). Running
# locally (no container), there's no /connectors -- fall back to the path relative to this
# repo's own layout so the same code runs either way.
_DOCKER_CONNECTORS_ROOT = "/connectors"
_LOCAL_CONNECTORS_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "connectors")
_CONNECTORS_ROOT = (
    os.environ.get("CONNECTORS_ROOT")
    or (_DOCKER_CONNECTORS_ROOT if os.path.isdir(_DOCKER_CONNECTORS_ROOT) else _LOCAL_CONNECTORS_ROOT)
)

# Every connector's package lives in its own directory but reuses the SAME module names
# (client.py, sync.py, mock_data.py) -- sys.path can only ever resolve one "client"/"sync"
# module by that bare name at a time, so four connectors on sys.path simultaneously would
# silently collide (whichever loaded first wins for every later `import client`). Loading
# each one by explicit file path under a unique name sidesteps that entirely.
SOURCE_TYPE_TO_DIR = {
    "shopify": "shopify",
    "google_ads": "google_ads",
    "meta_ads": "meta_ads",
    "netsuite": "netsuite",
}
_connector_cache = {}


def _load_module_from_path(unique_name, file_path):
    spec = importlib.util.spec_from_file_location(unique_name, file_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[unique_name] = module
    spec.loader.exec_module(module)
    return module


def _get_connector(source_type):
    """Returns the loaded `sync` module for one connector, loading it (and its client/
    mock_data siblings) on first use. sync.py's own `from client import X` / `import
    mock_data` statements are satisfied by briefly aliasing this connector's uniquely-loaded
    modules under the bare names "client"/"mock_data" in sys.modules -- only for the moment
    sync.py's top-level imports actually execute; by the time this function returns, sync.py
    has already bound whatever names it needed into its own module namespace, so the next
    connector loaded is free to reuse those bare names for itself without any collision.
    """
    if source_type in _connector_cache:
        return _connector_cache[source_type]

    connector_dir = os.path.join(_CONNECTORS_ROOT, SOURCE_TYPE_TO_DIR[source_type])
    client_module = _load_module_from_path(f"{source_type}_client", os.path.join(connector_dir, "client.py"))
    sys.modules["client"] = client_module
    mock_data_path = os.path.join(connector_dir, "mock_data.py")
    if os.path.isfile(mock_data_path):
        sys.modules["mock_data"] = _load_module_from_path(f"{source_type}_mock_data", mock_data_path)

    sync_module = _load_module_from_path(f"{source_type}_sync", os.path.join(connector_dir, "sync.py"))
    _connector_cache[source_type] = sync_module
    return sync_module


def get_conn():
    return psycopg2.connect(
        host=os.environ["POSTGRES_HOST"],
        port=os.environ.get("POSTGRES_PORT", "5432"),
        dbname=os.environ["POSTGRES_DB"],
        user=os.environ["POSTGRES_USER"],
        password=os.environ["POSTGRES_PASSWORD"],
    )


def _plan_interval_case_sql():
    """Builds a SQL CASE over app.tenants.plan from PLAN_SYNC_INTERVAL_MINUTES, so the
    mapping lives in exactly one place. Plan names are fixed Python literals here, not
    user input, so direct interpolation is safe -- same pattern already used below for
    SYNC_INTERVAL_MINUTES."""
    branches = " ".join(
        f"WHEN '{plan}' THEN interval '{minutes} minutes'"
        for plan, minutes in PLAN_SYNC_INTERVAL_MINUTES.items()
    )
    return f"CASE t.plan {branches} ELSE interval '{SYNC_INTERVAL_MINUTES} minutes' END"


def _due_connections(cur):
    cols = ", ".join(f"c.{col}" for col in CONNECTION_COLUMNS)
    cur.execute(
        f"""
        SELECT {cols}
        FROM app.connections c
        JOIN app.tenants t ON t.tenant_id = c.tenant_id
        WHERE c.status != 'disabled'
          AND (
              c.requested_sync_at IS NOT NULL
              OR c.last_synced_at IS NULL
              OR c.last_synced_at < now() - ({_plan_interval_case_sql()})
          )
        """
    )
    return [dict(zip(CONNECTION_COLUMNS, row)) for row in cur.fetchall()]


def _record_job(conn, tenant_id, connection_id, job_type, fn):
    with conn.cursor() as cur:
        cur.execute(
            """INSERT INTO app.job_runs (tenant_id, connection_id, job_type, status)
               VALUES (%s, %s, %s, 'running') RETURNING job_run_id""",
            (tenant_id, connection_id, job_type),
        )
        job_run_id = cur.fetchone()[0]
    conn.commit()

    records_synced = None
    try:
        records_synced = fn()
        status, error = "success", None
    except Exception as exc:  # a connector/dbt failure must not crash the poll loop
        logger.exception("%s job failed (connection=%s)", job_type, connection_id)
        status, error = "failed", str(exc)[:2000]

    with conn.cursor() as cur:
        cur.execute(
            """UPDATE app.job_runs SET status = %s, finished_at = now(), error_message = %s, records_synced = %s
               WHERE job_run_id = %s""",
            (status, error, psycopg2.extras.Json(records_synced) if records_synced else None, job_run_id),
        )
        if job_type == "extract" and status == "failed":
            cur.execute(
                "UPDATE app.connections SET status = 'error', last_error = %s WHERE connection_id = %s",
                (error, connection_id),
            )
    conn.commit()
    return status


def _scoped_dbt_build(tenant_ids):
    """fn for the transform job_run -- runs the dbt build scoped to just these tenants and
    returns a summary dict so it lands in that job_run's records_synced column, giving the
    same sync-visibility the per-connection extract jobs already have."""
    run_dbt_build(tenant_ids)
    return {"tenant_ids": [str(t) for t in tenant_ids], "scoped": True}


def run_once(conn, fernet_key):
    with conn.cursor() as cur:
        due = _due_connections(cur)

    # Which tenants actually had a successful extract this cycle -- passed to the dbt build
    # below so it only rebuilds THEIR mart rows (doc Sec 9 update, 2026-08-19), not every
    # tenant's. A set rather than synced_any's old boolean, since "rebuild everything" is
    # exactly the full-table-lock behavior that wedged the database earlier today.
    synced_tenant_ids = set()
    for connection in due:
        connector = _get_connector(connection["source_type"])
        status = _record_job(
            conn, connection["tenant_id"], connection["connection_id"], "extract",
            lambda c=connection, mod=connector: mod.sync_connection(conn, c, fernet_key),
        )
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE app.connections SET requested_sync_at = NULL WHERE connection_id = %s",
                (connection["connection_id"],),
            )
        conn.commit()
        if status == "success":
            synced_tenant_ids.add(connection["tenant_id"])

    if synced_tenant_ids:
        _record_job(conn, None, None, "transform", lambda: _scoped_dbt_build(synced_tenant_ids))


def main():
    # Read lazily inside each connector's sync.py only when a non-mock connection actually
    # needs to decrypt credentials -- mock-data connections (the MVP default) never touch
    # FERNET_KEY, so the orchestrator runs with zero setup out of the box.
    fernet_key = os.environ.get("FERNET_KEY")
    logger.info(
        "orchestrator starting: poll=%ss sync_interval=%sm connectors_root=%s",
        POLL_INTERVAL_SECONDS, SYNC_INTERVAL_MINUTES, _CONNECTORS_ROOT,
    )
    while True:
        conn = None
        try:
            # get_conn() itself used to be OUTSIDE this try -- a transient DB outage (a
            # restart, a brief network blip) would raise here and crash the whole process
            # instead of just skipping this cycle and retrying, requiring someone to notice
            # and manually restart the orchestrator.
            conn = get_conn()
            run_once(conn, fernet_key)
        except Exception:
            logger.exception("run_once failed")
        finally:
            if conn is not None:
                conn.close()
        time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
