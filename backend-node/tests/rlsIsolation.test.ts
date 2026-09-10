// Ports backend/tests/test_rls_isolation.py -- explicitly the single most important test file
// on the Python side, and the same is true here: tenant A must never see tenant B's rows
// through the API. Only the /team-based scenario is ported in Phase 1 (connections doesn't
// exist yet); the /connections cross-tenant-404 scenario gets added once that router is
// ported in Phase 2.
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { authHeader, api, cleanupTenant, resetRateLimitBetweenTests, signUp, type SignedUpTenant } from "./helpers.js";

resetRateLimitBetweenTests(beforeEach);

describe("RLS isolation", () => {
  let tenantA: SignedUpTenant;
  let tenantB: SignedUpTenant;

  beforeEach(async () => {
    tenantA = await signUp();
    tenantB = await signUp();
  });

  afterEach(async () => {
    await cleanupTenant(tenantA);
    await cleanupTenant(tenantB);
  });

  it("tenant cannot see another tenant's team", async () => {
    const teamA = await api.get("/team").set(authHeader(tenantA));
    const teamB = await api.get("/team").set(authHeader(tenantB));

    const emailsA = new Set(teamA.body.map((m: { email: string }) => m.email));
    const emailsB = new Set(teamB.body.map((m: { email: string }) => m.email));

    expect(emailsA.has(tenantA.email)).toBe(true);
    expect(emailsA.has(tenantB.email)).toBe(false);
    expect(emailsB.has(tenantB.email)).toBe(true);
    expect(emailsB.has(tenantA.email)).toBe(false);
  });
});
