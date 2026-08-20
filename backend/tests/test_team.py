def test_add_list_and_remove_teammate(client, auth_headers, signed_up):
    teammate_email = f"teammate-{signed_up['email']}"
    add = client.post(
        "/team",
        json={"email": teammate_email, "password": "teammatepassword123", "role": "admin"},
        headers=auth_headers,
    )
    assert add.status_code == 201
    user_id = add.json()["user_id"]

    listing = client.get("/team", headers=auth_headers)
    assert any(m["email"] == teammate_email for m in listing.json())

    remove = client.delete(f"/team/{user_id}", headers=auth_headers)
    assert remove.status_code == 204

    listing_after = client.get("/team", headers=auth_headers)
    assert all(m["user_id"] != user_id for m in listing_after.json())


def test_viewer_cannot_add_teammate(client, viewer_headers, signed_up):
    response = client.post(
        "/team",
        json={"email": f"blocked-{signed_up['email']}", "password": "whatever12345", "role": "viewer"},
        headers=viewer_headers,
    )
    assert response.status_code == 403


def test_cannot_remove_own_account(client, auth_headers):
    me = client.get("/auth/me", headers=auth_headers).json()
    response = client.delete(f"/team/{me['user_id']}", headers=auth_headers)
    assert response.status_code == 400


def test_admin_cannot_remove_owner(client, auth_headers, signed_up):
    # The bug this guards against: require_role("owner", "admin") alone treats the two as
    # equivalent, so without a rank check an admin could remove any owner outright.
    admin_email = f"admin-{signed_up['email']}"
    add = client.post(
        "/team", json={"email": admin_email, "password": "adminpassword123", "role": "admin"}, headers=auth_headers
    )
    assert add.status_code == 201, add.text

    admin_login = client.post("/auth/login", json={"email": admin_email, "password": "adminpassword123"})
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

    owner = client.get("/auth/me", headers=auth_headers).json()
    response = client.delete(f"/team/{owner['user_id']}", headers=admin_headers)
    assert response.status_code == 403


def test_admin_cannot_grant_owner_role(client, auth_headers, signed_up):
    # The other half of the same bug: without a rank check on the granted role, an admin
    # could hand the owner role to anyone (including themselves via a second account).
    admin_email = f"admin-{signed_up['email']}"
    add = client.post(
        "/team", json={"email": admin_email, "password": "adminpassword123", "role": "admin"}, headers=auth_headers
    )
    assert add.status_code == 201, add.text

    admin_login = client.post("/auth/login", json={"email": admin_email, "password": "adminpassword123"})
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

    response = client.post(
        "/team",
        json={"email": f"sneaky-{signed_up['email']}", "password": "sneakypassword123", "role": "owner"},
        headers=admin_headers,
    )
    assert response.status_code == 403


def test_last_owner_cannot_be_removed_by_anyone(client, auth_headers, signed_up):
    """Two independent guards now combine to make a zero-owner tenant impossible: an owner
    can only be removed by another owner (rank check), and nobody can remove themselves
    (self-removal check). So once exactly one owner remains, neither a lower role nor that
    owner themselves has any path to remove them -- this makes the old standalone "last
    owner" count check unreachable through the API (defense-in-depth, not dead weight: it
    still protects against someone loosening the other two guards later without noticing
    this interaction), so it's exercised here via the combination that actually matters."""
    second_owner_email = f"second-owner-{signed_up['email']}"
    admin_email = f"admin-{signed_up['email']}"
    for email, role, password in [
        (second_owner_email, "owner", "secondownerpw123"),
        (admin_email, "admin", "adminpassword123"),
    ]:
        add = client.post("/team", json={"email": email, "password": password, "role": role}, headers=auth_headers)
        assert add.status_code == 201, add.text

    original_owner = client.get("/auth/me", headers=auth_headers).json()

    second_owner_login = client.post(
        "/auth/login", json={"email": second_owner_email, "password": "secondownerpw123"}
    )
    second_owner_headers = {"Authorization": f"Bearer {second_owner_login.json()['access_token']}"}
    second_owner = client.get("/auth/me", headers=second_owner_headers).json()

    admin_login = client.post("/auth/login", json={"email": admin_email, "password": "adminpassword123"})
    admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

    # Two owners exist right now -- the second owner removing the first is allowed (equal rank).
    remove_first = client.delete(f"/team/{original_owner['user_id']}", headers=second_owner_headers)
    assert remove_first.status_code == 204

    # Only the second owner remains. Admin can't reach them at all (rank check)...
    admin_attempt = client.delete(f"/team/{second_owner['user_id']}", headers=admin_headers)
    assert admin_attempt.status_code == 403

    # ...and they can't remove themselves either (self-removal check) -- no path to zero owners.
    self_attempt = client.delete(f"/team/{second_owner['user_id']}", headers=second_owner_headers)
    assert self_attempt.status_code == 400
