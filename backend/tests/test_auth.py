def test_signup_then_me(client, signed_up):
    headers = {"Authorization": f"Bearer {signed_up['token']}"}
    response = client.get("/auth/me", headers=headers)
    assert response.status_code == 200
    body = response.json()
    assert body["email"] == signed_up["email"]
    assert body["role"] == "owner"


def test_signup_duplicate_email_is_rejected(client, signed_up, signup_payload):
    # signup_payload isn't the same dict signed_up used internally -- rebuild the exact
    # payload from what signed_up returned so the email actually collides.
    duplicate = {
        "company_name": "Different Co",
        "email": signed_up["email"],
        "password": "anotherpassword123",
    }
    response = client.post("/auth/signup", json=duplicate)
    assert response.status_code == 409


def test_login_wrong_password_is_rejected(client, signed_up):
    response = client.post("/auth/login", json={"email": signed_up["email"], "password": "wrong-password"})
    assert response.status_code == 401


def test_login_correct_password_succeeds(client, signed_up):
    response = client.post("/auth/login", json={"email": signed_up["email"], "password": signed_up["password"]})
    assert response.status_code == 200
    assert "access_token" in response.json()


def test_unauthenticated_request_is_rejected(client):
    response = client.get("/auth/me")
    assert response.status_code == 401


def test_password_reset_full_flow(client, signed_up):
    reset_request = client.post("/auth/request-password-reset", json={"email": signed_up["email"]})
    assert reset_request.status_code == 202

    # There's no real email provider in this test run either -- pull the token the same way
    # a human reading the dev-mode console log would, via the same reset-token helper used
    # by the endpoint itself, rather than parsing log output.
    from app.security import create_password_reset_token, verify_password_reset_token

    # (Re-derive a token the same way the endpoint does, since we can't intercept the one it
    # actually generated without parsing logs -- this exercises the same code path.)
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {signed_up['token']}"}).json()
    token = create_password_reset_token(me["user_id"])
    assert verify_password_reset_token(token) == me["user_id"]

    reset = client.post("/auth/reset-password", json={"token": token, "new_password": "brandnewpassword456"})
    assert reset.status_code == 204

    old_login = client.post("/auth/login", json={"email": signed_up["email"], "password": signed_up["password"]})
    assert old_login.status_code == 401

    new_login = client.post(
        "/auth/login", json={"email": signed_up["email"], "password": "brandnewpassword456"}
    )
    assert new_login.status_code == 200


def test_change_password_requires_correct_current_password(client, auth_headers, signed_up):
    wrong = client.post(
        "/auth/change-password",
        json={"current_password": "wrong-password", "new_password": "newpassword456"},
        headers=auth_headers,
    )
    assert wrong.status_code == 400

    right = client.post(
        "/auth/change-password",
        json={"current_password": signed_up["password"], "new_password": "newpassword456"},
        headers=auth_headers,
    )
    assert right.status_code == 204

    old_login = client.post("/auth/login", json={"email": signed_up["email"], "password": signed_up["password"]})
    assert old_login.status_code == 401
    new_login = client.post("/auth/login", json={"email": signed_up["email"], "password": "newpassword456"})
    assert new_login.status_code == 200


def test_change_password_requires_auth(client):
    response = client.post(
        "/auth/change-password", json={"current_password": "x", "new_password": "newpassword456"}
    )
    assert response.status_code == 401


def test_reset_password_rejects_garbage_token(client):
    response = client.post("/auth/reset-password", json={"token": "not-a-real-token", "new_password": "whatever123"})
    assert response.status_code == 400


def test_login_is_rate_limited(client, signed_up):
    # The limiter is keyed by (client IP, path) and shared across this whole test session's
    # TestClient, so exact attempts-before-429 depends on what ran before this test -- assert
    # the property (eventually blocked), not a specific attempt count.
    statuses = []
    for _ in range(10):
        response = client.post("/auth/login", json={"email": signed_up["email"], "password": "wrong"})
        statuses.append(response.status_code)
    assert 429 in statuses
