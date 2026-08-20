"""Runs against the real local Postgres (same one dev uses, via the repo-root .env) rather
than mocks -- this app's riskiest bugs so far have all been in RLS/grants/SQL, which a
mocked DB layer would never have caught. Every fixture creates disposable, clearly-tagged
rows and deletes them in teardown so a test run never touches real tenant data.
"""
import os
import random
import string

import psycopg2
import pytest
from dotenv import load_dotenv
from fastapi.testclient import TestClient

# The backend's own Settings loads .env internally via pydantic-settings, which does NOT
# populate os.environ -- load it explicitly here too, since the owner-role fixture below
# reads POSTGRES_USER/PASSWORD directly via os.environ (Settings has no such fields; the
# backend itself never uses the owner role).
load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", ".env"))

from app.config import settings  # noqa: E402
from app.main import app  # noqa: E402

TEST_EMAIL_MARKER = "apicem-pytest"


def _random_suffix():
    return "".join(random.choices(string.ascii_lowercase + string.digits, k=10))


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def _reset_rate_limits():
    """Every test starts with a clean rate-limit slate -- see rate_limit.reset()'s
    docstring for why TestClient specifically needs this."""
    from app import rate_limit

    rate_limit.reset()
    yield


@pytest.fixture(scope="session")
def owner_db_conn():
    """Direct connection as the table-owner role, for setup/teardown/assertions that must
    bypass RLS (e.g. deleting a test tenant's rows). Reuses the same POSTGRES_* values the
    orchestrator uses -- read directly since Settings only models the backend's own
    apicem_app credentials."""
    conn = psycopg2.connect(
        host=os.environ.get("POSTGRES_HOST", settings.postgres_host),
        port=os.environ.get("POSTGRES_PORT", settings.postgres_port),
        dbname=os.environ.get("POSTGRES_DB", settings.postgres_db),
        user=os.environ.get("POSTGRES_USER", "apicem"),
        password=os.environ.get("POSTGRES_PASSWORD", "apicem_dev_password"),
    )
    yield conn
    conn.close()


@pytest.fixture
def signup_payload():
    suffix = _random_suffix()
    return {
        "company_name": f"{TEST_EMAIL_MARKER}-{suffix}",
        "email": f"{TEST_EMAIL_MARKER}-{suffix}@example.com",
        "password": "testpassword123",
    }


@pytest.fixture
def signed_up(client, owner_db_conn, signup_payload):
    """Signs up a fresh disposable tenant/user via the real API and tears it down after."""
    response = client.post("/auth/signup", json=signup_payload)
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]

    yield {"token": token, **signup_payload}

    with owner_db_conn.cursor() as cur:
        cur.execute("DELETE FROM app.users WHERE email = %s", (signup_payload["email"],))
        cur.execute("DELETE FROM app.tenants WHERE name = %s", (signup_payload["company_name"],))
    owner_db_conn.commit()


@pytest.fixture
def auth_headers(signed_up):
    return {"Authorization": f"Bearer {signed_up['token']}"}


@pytest.fixture
def viewer_headers(client, auth_headers, signed_up):
    """Adds a second, viewer-role user to the SAME tenant signed_up created, and returns
    their auth headers -- for testing that RBAC actually blocks the UI actions it's meant
    to (doc Sec 6.1), not just that the DB column exists."""
    viewer_email = f"viewer-{signed_up['email']}"
    response = client.post(
        "/team",
        json={"email": viewer_email, "password": "viewerpassword123", "role": "viewer"},
        headers=auth_headers,
    )
    assert response.status_code == 201, response.text

    login = client.post("/auth/login", json={"email": viewer_email, "password": "viewerpassword123"})
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}
