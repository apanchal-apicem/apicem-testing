"""Thin wrapper around the dbt CLI (doc Sec 9: dbt-core running via the orchestrator).
Standing in for Dagster's native dbt integration in this MVP -- swap in dagster-dbt later
without touching the dbt project itself.
"""
import json
import os
import shutil
import subprocess
import sys

# In Docker, the dbt project is bind-mounted at /dbt (see docker-compose.yml). Running
# locally (no container), there's no /dbt -- fall back to the path relative to this repo's
# own layout so the same code runs either way.
_DOCKER_DBT_DIR = "/dbt"
_LOCAL_DBT_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "warehouse", "dbt")
_DEFAULT_DBT_DIR = _DOCKER_DBT_DIR if os.path.isdir(_DOCKER_DBT_DIR) else _LOCAL_DBT_DIR

DBT_PROJECT_DIR = os.environ.get("DBT_PROJECT_DIR", _DEFAULT_DBT_DIR)
DBT_PROFILES_DIR = os.environ.get("DBT_PROFILES_DIR", _DEFAULT_DBT_DIR)

def _resolve_dbt_executable():
    # Check beside the CURRENT interpreter FIRST, before falling back to PATH: this
    # orchestrator pip-installs a specific, known-good dbt-core+dbt-postgres into its own
    # venv precisely to control which dbt actually runs. Checking PATH first would let any
    # other "dbt" earlier on PATH silently shadow it -- which is exactly what happened when
    # a globally-installed dbt Fusion (a different, Rust-based engine with no Postgres
    # support as of this writing) took over and every build failed with an adapter error
    # that had nothing to do with this project's code.
    candidate = os.path.join(os.path.dirname(sys.executable), "dbt.exe" if os.name == "nt" else "dbt")
    if os.path.isfile(candidate):
        return candidate
    found = shutil.which("dbt")
    return found or "dbt"


_DBT_EXECUTABLE = _resolve_dbt_executable()
_deps_installed = False


def _run(args):
    result = subprocess.run(
        [_DBT_EXECUTABLE, *args, "--project-dir", DBT_PROJECT_DIR, "--profiles-dir", DBT_PROFILES_DIR],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"dbt {' '.join(args)} failed:\n{result.stdout}\n{result.stderr}")
    return result.stdout


def run_dbt_build(tenant_ids=None):
    """tenant_ids: an iterable of tenant_id strings that had a successful extract this poll
    cycle, or None for a full build. Passed through as the `sync_tenant_ids` dbt var, which
    warehouse/dbt/macros/tenant_scope.sql's `tenant_scope_predicate()` uses to scope every
    mart model's incremental rebuild to just those tenants (doc Sec 9 update, 2026-08-19) --
    every other tenant's rows are left untouched. None (the default) skips that var entirely,
    so models fall back to a full rebuild -- used for the one-time initial build and any
    manual `dbt run`/`dbt build` invocation, so existing dev workflows keep working unchanged.
    """
    global _deps_installed
    if not _deps_installed:
        _run(["deps"])
        _deps_installed = True

    extra_args = []
    if tenant_ids is not None:
        # tenant_ids elements are uuid.UUID objects (from psycopg2), not strings -- json.dumps
        # can't serialize those directly.
        extra_args = ["--vars", json.dumps({"sync_tenant_ids": [str(t) for t in tenant_ids]})]

    _run(["run", *extra_args])
    # dbt test exits non-zero only on error-severity failures (e.g. primary-key/uniqueness),
    # which raises here and marks the job_run failed; warn-severity anomaly tests (doc Sec
    # 7.2) are recorded in dbt's run results but never fail this call.
    _run(["test", *extra_args])
