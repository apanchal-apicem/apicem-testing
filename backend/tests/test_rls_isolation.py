"""The single most important property this whole architecture depends on (doc Sec 6.2):
tenant A must never be able to see tenant B's rows through the API, even by guessing a
real connection_id. Every RLS/grants bug hit during development would have been caught
immediately by a test like this -- it's the one regression suite that must never be
allowed to go red without being taken seriously.
"""
import random
import string


def _signup(client, owner_db_conn):
    suffix = "".join(random.choices(string.ascii_lowercase + string.digits, k=10))
    payload = {
        "company_name": f"apicem-pytest-iso-{suffix}",
        "email": f"apicem-pytest-iso-{suffix}@example.com",
        "password": "testpassword123",
    }
    response = client.post("/auth/signup", json=payload)
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"token": token, **payload}


def _cleanup(owner_db_conn, tenant):
    with owner_db_conn.cursor() as cur:
        cur.execute("DELETE FROM app.users WHERE email = %s", (tenant["email"],))
        cur.execute("DELETE FROM app.tenants WHERE name = %s", (tenant["company_name"],))
    owner_db_conn.commit()


def test_tenant_cannot_list_another_tenants_connections(client, owner_db_conn):
    tenant_a = _signup(client, owner_db_conn)
    tenant_b = _signup(client, owner_db_conn)
    try:
        headers_a = {"Authorization": f"Bearer {tenant_a['token']}"}
        headers_b = {"Authorization": f"Bearer {tenant_b['token']}"}

        created = client.post("/connections", json={"use_mock_data": True}, headers=headers_a)
        assert created.status_code == 201
        connection_id = created.json()["connection_id"]

        # Tenant B's own list must never include tenant A's connection.
        b_list = client.get("/connections", headers=headers_b)
        assert all(c["connection_id"] != connection_id for c in b_list.json())

        # Tenant B guessing tenant A's real connection_id directly must 404, not leak data
        # or succeed -- RLS should make it invisible, not just filtered from a list view.
        b_direct = client.delete(f"/connections/{connection_id}", headers=headers_b)
        assert b_direct.status_code == 404

        # Tenant A can still see and manage it.
        a_list = client.get("/connections", headers=headers_a)
        assert any(c["connection_id"] == connection_id for c in a_list.json())
    finally:
        _cleanup(owner_db_conn, tenant_a)
        _cleanup(owner_db_conn, tenant_b)


def test_tenant_cannot_see_another_tenants_team(client, owner_db_conn):
    tenant_a = _signup(client, owner_db_conn)
    tenant_b = _signup(client, owner_db_conn)
    try:
        headers_a = {"Authorization": f"Bearer {tenant_a['token']}"}
        headers_b = {"Authorization": f"Bearer {tenant_b['token']}"}

        team_a = client.get("/team", headers=headers_a).json()
        team_b = client.get("/team", headers=headers_b).json()

        emails_a = {m["email"] for m in team_a}
        emails_b = {m["email"] for m in team_b}
        assert tenant_a["email"] in emails_a
        assert tenant_a["email"] not in emails_b
        assert tenant_b["email"] in emails_b
        assert tenant_b["email"] not in emails_a
    finally:
        _cleanup(owner_db_conn, tenant_a)
        _cleanup(owner_db_conn, tenant_b)
