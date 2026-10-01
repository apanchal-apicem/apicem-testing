// Ports backend/tests/test_auth.py scenario-for-scenario.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createPasswordResetToken, verifyPasswordResetToken } from "../src/security.js";
import { authHeader, api, cleanupTenant, resetRateLimitBetweenTests, signUp, type SignedUpTenant } from "./helpers.js";

resetRateLimitBetweenTests(beforeEach);

describe("auth", () => {
  let tenant: SignedUpTenant;

  beforeEach(async () => {
    tenant = await signUp();
  });

  afterEach(async () => {
    await cleanupTenant(tenant);
  });

  it("signup then /auth/me returns the right identity", async () => {
    const response = await api.get("/auth/me").set(authHeader(tenant));
    expect(response.status).toBe(200);
    expect(response.body.email).toBe(tenant.email);
    expect(response.body.role).toBe("owner");
  });

  it("can update profile name and retrieve it via /auth/me", async () => {
    const unauth = await api.patch("/auth/me").send({ name: "Jane Doe" });
    expect(unauth.status).toBe(401);

    const empty = await api
      .patch("/auth/me")
      .set(authHeader(tenant))
      .send({ name: "   " });
    expect(empty.status).toBe(400);

    const update = await api
      .patch("/auth/me")
      .set(authHeader(tenant))
      .send({ name: "Jane Doe" });
    expect(update.status).toBe(200);
    expect(update.body.name).toBe("Jane Doe");

    const me = await api.get("/auth/me").set(authHeader(tenant));
    expect(me.status).toBe(200);
    expect(me.body.name).toBe("Jane Doe");
  });

  it("signup with a duplicate email is rejected", async () => {
    const response = await api
      .post("/auth/signup")
      .send({ company_name: "Different Co", email: tenant.email, password: "anotherpassword123" });
    expect(response.status).toBe(409);
  });

  it("login with the wrong password is rejected", async () => {
    const response = await api.post("/auth/login").send({ email: tenant.email, password: "wrong-password" });
    expect(response.status).toBe(401);
  });

  it("login with the correct password succeeds", async () => {
    const response = await api.post("/auth/login").send({ email: tenant.email, password: tenant.password });
    expect(response.status).toBe(200);
    expect(response.body.access_token).toBeDefined();
  });

  it("an unauthenticated request to /auth/me is rejected", async () => {
    const response = await api.get("/auth/me");
    expect(response.status).toBe(401);
  });

  it("password reset full flow", async () => {
    const resetRequest = await api.post("/auth/request-password-reset").send({ email: tenant.email });
    expect(resetRequest.status).toBe(202);

    // No real email provider in this test run either -- re-derive a token the same way the
    // endpoint does (there's no log to parse in a test), exercising the same code path.
    const me = (await api.get("/auth/me").set(authHeader(tenant))).body;
    const token = createPasswordResetToken(me.user_id);
    expect(verifyPasswordResetToken(token)).toBe(me.user_id);

    const reset = await api.post("/auth/reset-password").send({ token, new_password: "brandnewpassword456" });
    expect(reset.status).toBe(204);

    const oldLogin = await api.post("/auth/login").send({ email: tenant.email, password: tenant.password });
    expect(oldLogin.status).toBe(401);

    const newLogin = await api
      .post("/auth/login")
      .send({ email: tenant.email, password: "brandnewpassword456" });
    expect(newLogin.status).toBe(200);
  });

  it("change-password requires the correct current password", async () => {
    const wrong = await api
      .post("/auth/change-password")
      .set(authHeader(tenant))
      .send({ current_password: "wrong-password", new_password: "newpassword456" });
    expect(wrong.status).toBe(400);

    const right = await api
      .post("/auth/change-password")
      .set(authHeader(tenant))
      .send({ current_password: tenant.password, new_password: "newpassword456" });
    expect(right.status).toBe(204);

    const oldLogin = await api.post("/auth/login").send({ email: tenant.email, password: tenant.password });
    expect(oldLogin.status).toBe(401);
    const newLogin = await api.post("/auth/login").send({ email: tenant.email, password: "newpassword456" });
    expect(newLogin.status).toBe(200);
  });

  it("change-password requires auth", async () => {
    const response = await api
      .post("/auth/change-password")
      .send({ current_password: "x", new_password: "newpassword456" });
    expect(response.status).toBe(401);
  });

  it("reset-password rejects a garbage token", async () => {
    const response = await api
      .post("/auth/reset-password")
      .send({ token: "not-a-real-token", new_password: "whatever123" });
    expect(response.status).toBe(400);
  });

  it("login is rate-limited", async () => {
    // Keyed by (client IP, path) and shared across this whole test file's app instance, so
    // the exact attempts-before-429 depends on what ran before -- assert the property
    // (eventually blocked), not a specific attempt count.
    const statuses: number[] = [];
    for (let i = 0; i < 10; i++) {
      const response = await api.post("/auth/login").send({ email: tenant.email, password: "wrong" });
      statuses.push(response.status);
    }
    expect(statuses).toContain(429);
  });
});
