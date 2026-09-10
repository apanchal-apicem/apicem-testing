// Ports backend/tests/test_team.py scenario-for-scenario, including the ROLE_RANK guard
// tests -- the real bug they guard against: require_role("owner","admin") alone treats the
// two as equivalent, so without a rank check an admin could remove/outrank any owner.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { addViewer, authHeader, api, cleanupTenant, resetRateLimitBetweenTests, signUp, type SignedUpTenant } from "./helpers.js";

resetRateLimitBetweenTests(beforeEach);

describe("team", () => {
  let tenant: SignedUpTenant;

  beforeEach(async () => {
    tenant = await signUp();
  });

  afterEach(async () => {
    await cleanupTenant(tenant);
  });

  it("add, list, and remove a teammate", async () => {
    const teammateEmail = `teammate-${tenant.email}`;
    const add = await api
      .post("/team")
      .set(authHeader(tenant))
      .send({ email: teammateEmail, password: "teammatepassword123", role: "admin" });
    expect(add.status).toBe(201);
    const userId = add.body.user_id;

    const listing = await api.get("/team").set(authHeader(tenant));
    expect(listing.body.some((m: { email: string }) => m.email === teammateEmail)).toBe(true);

    const remove = await api.delete(`/team/${userId}`).set(authHeader(tenant));
    expect(remove.status).toBe(204);

    const listingAfter = await api.get("/team").set(authHeader(tenant));
    expect(listingAfter.body.every((m: { user_id: string }) => m.user_id !== userId)).toBe(true);
  });

  it("a viewer cannot add a teammate", async () => {
    const viewerHeaders = await addViewer(tenant);
    const response = await api
      .post("/team")
      .set(viewerHeaders)
      .send({ email: `blocked-${tenant.email}`, password: "whatever12345", role: "viewer" });
    expect(response.status).toBe(403);
  });

  it("cannot remove your own account", async () => {
    const me = (await api.get("/auth/me").set(authHeader(tenant))).body;
    const response = await api.delete(`/team/${me.user_id}`).set(authHeader(tenant));
    expect(response.status).toBe(400);
  });

  it("an admin cannot remove an owner", async () => {
    const adminEmail = `admin-${tenant.email}`;
    const add = await api
      .post("/team")
      .set(authHeader(tenant))
      .send({ email: adminEmail, password: "adminpassword123", role: "admin" });
    expect(add.status).toBe(201);

    const adminLogin = await api.post("/auth/login").send({ email: adminEmail, password: "adminpassword123" });
    const adminHeaders = { Authorization: `Bearer ${adminLogin.body.access_token}` };

    const owner = (await api.get("/auth/me").set(authHeader(tenant))).body;
    const response = await api.delete(`/team/${owner.user_id}`).set(adminHeaders);
    expect(response.status).toBe(403);
  });

  it("an admin cannot grant the owner role", async () => {
    const adminEmail = `admin-${tenant.email}`;
    const add = await api
      .post("/team")
      .set(authHeader(tenant))
      .send({ email: adminEmail, password: "adminpassword123", role: "admin" });
    expect(add.status).toBe(201);

    const adminLogin = await api.post("/auth/login").send({ email: adminEmail, password: "adminpassword123" });
    const adminHeaders = { Authorization: `Bearer ${adminLogin.body.access_token}` };

    const response = await api
      .post("/team")
      .set(adminHeaders)
      .send({ email: `sneaky-${tenant.email}`, password: "sneakypassword123", role: "owner" });
    expect(response.status).toBe(403);
  });

  it("the last owner cannot be removed by anyone", async () => {
    // Two independent guards combine here: an owner can only be removed by another owner
    // (rank check), and nobody can remove themselves (self-removal check) -- once exactly
    // one owner remains, neither a lower role nor that owner themselves has a path to remove
    // them.
    const secondOwnerEmail = `second-owner-${tenant.email}`;
    const adminEmail = `admin-${tenant.email}`;
    for (const [email, role, password] of [
      [secondOwnerEmail, "owner", "secondownerpw123"],
      [adminEmail, "admin", "adminpassword123"],
    ]) {
      const add = await api.post("/team").set(authHeader(tenant)).send({ email, password, role });
      expect(add.status).toBe(201);
    }

    const originalOwner = (await api.get("/auth/me").set(authHeader(tenant))).body;

    const secondOwnerLogin = await api
      .post("/auth/login")
      .send({ email: secondOwnerEmail, password: "secondownerpw123" });
    const secondOwnerHeaders = { Authorization: `Bearer ${secondOwnerLogin.body.access_token}` };
    const secondOwner = (await api.get("/auth/me").set(secondOwnerHeaders)).body;

    const adminLogin = await api.post("/auth/login").send({ email: adminEmail, password: "adminpassword123" });
    const adminHeaders = { Authorization: `Bearer ${adminLogin.body.access_token}` };

    // Two owners exist right now -- the second owner removing the first is allowed (equal rank).
    const removeFirst = await api.delete(`/team/${originalOwner.user_id}`).set(secondOwnerHeaders);
    expect(removeFirst.status).toBe(204);

    // Only the second owner remains. Admin can't reach them at all (rank check)...
    const adminAttempt = await api.delete(`/team/${secondOwner.user_id}`).set(adminHeaders);
    expect(adminAttempt.status).toBe(403);

    // ...and they can't remove themselves either (self-removal check) -- no path to zero owners.
    const selfAttempt = await api.delete(`/team/${secondOwner.user_id}`).set(secondOwnerHeaders);
    expect(selfAttempt.status).toBe(400);
  });
});
