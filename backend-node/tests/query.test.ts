import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  api,
  authHeader,
  cleanupTenant,
  resetRateLimitBetweenTests,
  signUp,
  type SignedUpTenant,
} from "./helpers.js";

describe("query engine API", () => {
  resetRateLimitBetweenTests(beforeEach);

  let owner: SignedUpTenant;

  afterEach(async () => {
    if (owner) await cleanupTenant(owner);
  });

  it("executes single-metric ad-hoc query with no dimensions", async () => {
    owner = await signUp();

    const res = await api
      .post("/query")
      .set(authHeader(owner))
      .send({ metricIds: ["gross_revenue"] });

    expect(res.status).toBe(200);
    expect(res.body.columns).toBeDefined();
    expect(res.body.columns.length).toBeGreaterThan(0);
    expect(res.body.chartSuggestion).toBe("kpi");
    expect(Array.isArray(res.body.rows)).toBe(true);
    expect(typeof res.body.sql).toBe("string");
  });

  it("executes multi-metric query grouped by channel", async () => {
    owner = await signUp();

    const res = await api
      .post("/query")
      .set(authHeader(owner))
      .send({
        metricIds: ["gross_revenue", "net_revenue"],
        dimensions: ["channel"],
      });

    expect(res.status).toBe(200);
    expect(res.body.columns).toBeDefined();
    expect(res.body.columns.find((c: any) => c.key === "channel")).toBeDefined();
    expect(res.body.columns.find((c: any) => c.key === "gross_revenue")).toBeDefined();
    expect(res.body.columns.find((c: any) => c.key === "net_revenue")).toBeDefined();
    expect(res.body.chartSuggestion).toBe("bar");
    expect(Array.isArray(res.body.rows)).toBe(true);
  });

  it("executes metric query grouped by product category", async () => {
    owner = await signUp();

    const res = await api
      .post("/query")
      .set(authHeader(owner))
      .send({
        metricIds: ["gross_revenue"],
        dimensions: ["category"],
        filters: [{ column: "category", value: "Apparel" }],
      });

    expect(res.status).toBe(200);
    expect(res.body.columns).toBeDefined();
    expect(res.body.columns.find((c: any) => c.key === "category")).toBeDefined();
    expect(res.body.columns.find((c: any) => c.key === "value")).toBeDefined();
    expect(res.body.chartSuggestion).toBe("bar");
    expect(Array.isArray(res.body.rows)).toBe(true);
  });
});
