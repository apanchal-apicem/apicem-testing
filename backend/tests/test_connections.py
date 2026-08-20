def test_create_list_and_delete_mock_connection(client, auth_headers):
    create = client.post("/connections", json={"use_mock_data": True}, headers=auth_headers)
    assert create.status_code == 201
    connection_id = create.json()["connection_id"]
    assert create.json()["status"] == "pending"

    listing = client.get("/connections", headers=auth_headers)
    assert listing.status_code == 200
    assert any(c["connection_id"] == connection_id for c in listing.json())

    delete = client.delete(f"/connections/{connection_id}", headers=auth_headers)
    assert delete.status_code == 204

    listing_after = client.get("/connections", headers=auth_headers)
    assert all(c["connection_id"] != connection_id for c in listing_after.json())


def test_real_connection_without_fernet_key_or_shop_domain_is_rejected(client, auth_headers):
    # use_mock_data=False with no shop_domain/access_token must fail validation before ever
    # reaching the FERNET_KEY check.
    response = client.post("/connections", json={"use_mock_data": False}, headers=auth_headers)
    assert response.status_code == 400


def test_delete_nonexistent_connection_is_404(client, auth_headers):
    response = client.delete("/connections/00000000-0000-0000-0000-000000000000", headers=auth_headers)
    assert response.status_code == 404


def test_sync_now_requires_owner_or_admin(client, auth_headers, viewer_headers):
    create = client.post("/connections", json={"use_mock_data": True}, headers=auth_headers)
    connection_id = create.json()["connection_id"]

    as_viewer = client.post(f"/connections/{connection_id}/sync-now", headers=viewer_headers)
    assert as_viewer.status_code == 403

    as_owner = client.post(f"/connections/{connection_id}/sync-now", headers=auth_headers)
    assert as_owner.status_code == 202
