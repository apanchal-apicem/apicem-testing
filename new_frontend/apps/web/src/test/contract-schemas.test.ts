import { describe, expect, it } from "vitest";
import {
  createDataSourceInputSchema,
  createExperimentInputSchema,
  createWorkspaceInputSchema,
} from "@apicem/api-contract";

/**
 * These schemas are the one thing standing between whatever a form (or a
 * malicious client bypassing the form entirely) sends and the data every
 * screen in this app assumes it can trust — and per SECURITY.md, the real
 * backend is expected to run the exact same parse rather than trusting that
 * the frontend's validation ran. That only holds if the schemas actually
 * enforce what their `.min`/`.max`/`.enum` calls claim to.
 */
describe("createWorkspaceInputSchema", () => {
  it("accepts a normal name", () => {
    expect(createWorkspaceInputSchema.safeParse({ name: "Acme Co" }).success).toBe(true);
  });

  it("rejects an empty name", () => {
    expect(createWorkspaceInputSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("rejects a name over 80 characters", () => {
    expect(createWorkspaceInputSchema.safeParse({ name: "x".repeat(81) }).success).toBe(false);
  });
});

describe("createDataSourceInputSchema", () => {
  const validCredentials = { apiKey: "test-key" };

  it("accepts a known source type", () => {
    const result = createDataSourceInputSchema.safeParse({ type: "shopify", name: "Shopify", credentials: validCredentials });
    expect(result.success).toBe(true);
  });

  it("rejects a source type outside the allowlist — never an arbitrary string", () => {
    const result = createDataSourceInputSchema.safeParse({ type: "arbitrary_sql_endpoint", name: "x", credentials: validCredentials });
    expect(result.success).toBe(false);
  });

  it("rejects a request with no credentials object at all", () => {
    const result = createDataSourceInputSchema.safeParse({ type: "shopify", name: "Shopify" });
    expect(result.success).toBe(false);
  });
});

describe("createExperimentInputSchema", () => {
  const base = {
    name: "Test experiment",
    hypothesis: "Some testable claim",
    metricId: "met_revenue",
    unitType: "geo" as const,
    startDate: "2026-01-01",
    endDate: "2026-02-01",
  };

  it("accepts treatment/holdout groups with at least one unit each", () => {
    const result = createExperimentInputSchema.safeParse({
      ...base,
      treatment: { units: ["California"] },
      holdout: { units: ["Nevada"] },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a treatment group with zero units — there's nothing to run the test on", () => {
    const result = createExperimentInputSchema.safeParse({
      ...base,
      treatment: { units: [] },
      holdout: { units: ["Nevada"] },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unrecognized unitType outside geo/customer_segment", () => {
    const result = createExperimentInputSchema.safeParse({
      ...base,
      unitType: "device_type",
      treatment: { units: ["A"] },
      holdout: { units: ["B"] },
    });
    expect(result.success).toBe(false);
  });
});
