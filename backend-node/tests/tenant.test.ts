// No Python equivalent existed for backend/app/routers/tenant.py (a real gap in the original
// suite) -- added here since the behavior was already manually verified live against the real
// uploads/logos directory before this file was written.
import fs from "node:fs";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LOGO_DIR } from "../src/routes/tenant.js";
import { addViewer, authHeader, api, cleanupTenant, resetRateLimitBetweenTests, signUp, type SignedUpTenant } from "./helpers.js";

resetRateLimitBetweenTests(beforeEach);

describe("tenant", () => {
  let tenant: SignedUpTenant;

  beforeEach(async () => {
    tenant = await signUp();
  });

  afterEach(async () => {
    await cleanupTenant(tenant);
  });

  it("renames the workspace", async () => {
    const response = await api.patch("/tenant").set(authHeader(tenant)).send({ name: "Renamed Co" });
    expect(response.status).toBe(204);
    const me = (await api.get("/auth/me").set(authHeader(tenant))).body;
    expect(me.tenant_name).toBe("Renamed Co");
  });

  it("rejects an empty workspace name", async () => {
    const response = await api.patch("/tenant").set(authHeader(tenant)).send({ name: "   " });
    expect(response.status).toBe(400);
  });

  it("a viewer cannot rename the workspace", async () => {
    const viewerHeaders = await addViewer(tenant);
    const response = await api.patch("/tenant").set(viewerHeaders).send({ name: "Sneaky Rename" });
    expect(response.status).toBe(403);
  });

  it("uploads and removes a logo, cleaning up the file on disk", async () => {
    const upload = await api
      .post("/tenant/logo")
      .set(authHeader(tenant))
      .attach("file", Buffer.from("fake png bytes"), { filename: "logo.png", contentType: "image/png" });
    expect(upload.status).toBe(204);

    const me = (await api.get("/auth/me").set(authHeader(tenant))).body;
    expect(me.tenant_logo_url).toMatch(/^\/uploads\/logos\/.+\.png\?v=/);

    const filename = me.tenant_logo_url.split("/").pop()!.split("?")[0];
    expect(fs.existsSync(`${LOGO_DIR}/${filename}`)).toBe(true);

    const fetched = await api.get(me.tenant_logo_url);
    expect(fetched.status).toBe(200);

    const remove = await api.delete("/tenant/logo").set(authHeader(tenant));
    expect(remove.status).toBe(204);
    expect(fs.existsSync(`${LOGO_DIR}/${filename}`)).toBe(false);

    const meAfter = (await api.get("/auth/me").set(authHeader(tenant))).body;
    expect(meAfter.tenant_logo_url).toBeNull();
  });

  it("rejects a disallowed logo content type", async () => {
    const response = await api
      .post("/tenant/logo")
      .set(authHeader(tenant))
      .attach("file", Buffer.from("not an image"), { filename: "malware.exe", contentType: "application/octet-stream" });
    expect(response.status).toBe(400);
  });
});
