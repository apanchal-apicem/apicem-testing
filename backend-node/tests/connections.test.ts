import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  api,
  authHeader,
  cleanupTenant,
  resetRateLimitBetweenTests,
  signUp,
  type SignedUpTenant,
} from "./helpers.js";

describe("connections", () => {
  resetRateLimitBetweenTests(beforeEach);

  let owner: SignedUpTenant;

  afterEach(async () => {
    if (owner) await cleanupTenant(owner);
  });

  it("creates, lists, triggers sync, and deletes a connection", async () => {
    owner = await signUp();

    // 1. Create a connection
    const createRes = await api
      .post("/connections")
      .set(authHeader(owner))
      .send({
        source_type: "shopify",
        display_name: "My Flagship Shopify Store",
        use_mock_data: true,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.connection_id).toBeDefined();
    expect(createRes.body.source_type).toBe("shopify");
    expect(createRes.body.display_name).toBe("My Flagship Shopify Store");
    expect(createRes.body.status).toBe("pending");

    const connId = createRes.body.connection_id;

    // 2. List connections
    const listRes = await api.get("/connections").set(authHeader(owner));

    expect(listRes.status).toBe(200);
    expect(Array.isArray(listRes.body)).toBe(true);
    const found = listRes.body.find(
      (c: { connection_id: string }) => c.connection_id === connId,
    );
    expect(found).toBeDefined();
    expect(found.display_name).toBe("My Flagship Shopify Store");

    // 3. Trigger sync now
    const syncRes = await api
      .post(`/connections/${connId}/sync-now`)
      .set(authHeader(owner));

    expect(syncRes.status).toBe(202);
    expect(syncRes.body.status).toBe("sync_requested");

    // 4. List job runs
    const runsRes = await api
      .get(`/connections/${connId}/job_runs`)
      .set(authHeader(owner));

    expect(runsRes.status).toBe(200);
    expect(Array.isArray(runsRes.body)).toBe(true);

    // 5. Delete connection
    const deleteRes = await api
      .delete(`/connections/${connId}`)
      .set(authHeader(owner));

    expect(deleteRes.status).toBe(204);

    // Verify it is gone from list
    const afterList = await api.get("/connections").set(authHeader(owner));
    const deleted = afterList.body.find(
      (c: { connection_id: string }) => c.connection_id === connId,
    );
    expect(deleted).toBeUndefined();
  });

  it("defaults display_name if not provided", async () => {
    owner = await signUp();

    const res = await api
      .post("/connections")
      .set(authHeader(owner))
      .send({
        source_type: "shopify",
        use_mock_data: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.display_name).toBe("Shopify connection");
  });

  it("rejects unknown source type", async () => {
    owner = await signUp();

    const res = await api
      .post("/connections")
      .set(authHeader(owner))
      .send({
        source_type: "unsupported_crm",
      });

    expect(res.status).toBe(400);
    expect(res.body.detail).toContain("Unknown source_type");
  });
});
