import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "../types";

/**
 * The mock adapter computes its module-level state (active workspace,
 * reconstructed custom workspaces, the workspace slice cache) once, at
 * import time, from whatever's in localStorage. Every test needs a clean
 * slate — `vi.resetModules()` plus a dynamic re-import gets a fresh instance
 * that reads the just-cleared localStorage, rather than a warm one holding
 * a previous test's state in module-level variables.
 */
async function freshMockClient(): Promise<ApiClient> {
  vi.resetModules();
  const mod = await import("./adapter");
  return mod.mockClient;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("tenant isolation across workspaces", () => {
  it("never returns another workspace's data sources, reports, or experiments after a switch", async () => {
    const client = await freshMockClient();

    const northwindSources = await client.listDataSources();
    expect(northwindSources.length).toBeGreaterThan(0);

    const workspaces = await client.listMyWorkspaces();
    const aurora = workspaces.find((w) => w.name.includes("Aurora"));
    expect(aurora).toBeDefined();

    await client.switchWorkspace(aurora!.id);
    const auroraSources = await client.listDataSources();
    expect(auroraSources.length).toBeGreaterThan(0);
    expect(auroraSources.every((s) => s.workspaceId === aurora!.id)).toBe(true);

    const northwindIds = new Set(northwindSources.map((s) => s.id));
    expect(auroraSources.some((s) => northwindIds.has(s.id))).toBe(false);
  });

  it("never leaks a report created in one workspace into another workspace's list", async () => {
    const client = await freshMockClient();

    // Created while the default (Northwind) workspace is active.
    const created = await client.createReport({ name: "Leak test report" });
    const ownReports = await client.listReports();
    expect(ownReports.some((r) => r.id === created.id)).toBe(true);

    const workspaces = await client.listMyWorkspaces();
    const aurora = workspaces.find((w) => w.name.includes("Aurora"))!;
    await client.switchWorkspace(aurora.id);

    const auroraReports = await client.listReports();
    expect(auroraReports.some((r) => r.id === created.id)).toBe(false);
  });

  it("rejects switching to a workspace id that isn't a real membership, rather than silently falling back to one", async () => {
    const client = await freshMockClient();
    const before = await client.getCurrentWorkspace();

    // `vi.resetModules()` gives the freshly-loaded adapter its own copy of
    // the ApiError class, so `instanceof` across that boundary would fail
    // for reasons that have nothing to do with the adapter's behavior —
    // assert on the shape (a 403) instead.
    await expect(client.switchWorkspace("wksp_not_a_real_workspace")).rejects.toMatchObject({ status: 403 });

    // A rejected switch must leave the active workspace exactly where it was.
    const after = await client.getCurrentWorkspace();
    expect(after.id).toBe(before.id);
  });

  it("recovers to the default workspace if a stale or bogus workspace id was left in storage from a previous session", async () => {
    window.localStorage.setItem("apicem.mock.activeWorkspaceId", JSON.stringify("wksp_stale_from_old_session"));
    const client = await freshMockClient();
    const workspace = await client.getCurrentWorkspace();
    expect(workspace.id).not.toBe("wksp_stale_from_old_session");
  });

  it("gives a newly created workspace a genuinely empty, isolated slate", async () => {
    const client = await freshMockClient();
    const seededSources = await client.listDataSources();
    expect(seededSources.length).toBeGreaterThan(0);

    const created = await client.createWorkspace({ name: "Test Client Co" });

    const current = await client.getCurrentWorkspace();
    expect(current.id).toBe(created.id);
    expect(await client.listDataSources()).toEqual([]);
    expect(await client.listReports()).toEqual([]);
    expect(await client.listExperiments()).toEqual([]);
  });
});

describe("a report's Home-page card is derived from the report, not a second stored copy", () => {
  it("shows a newly created report on the Home-page list immediately, with no separate creation step", async () => {
    const client = await freshMockClient();
    const created = await client.createReport({ name: "Board recap" });

    const workbooks = await client.listWorkbooks();
    const card = workbooks.find((w) => w.id === created.id);
    expect(card).toBeDefined();
    expect(card!.kind).toBe("report");
    expect(card!.name).toBe("Board recap");
  });

  it("keeps the Home-page card's name in sync after a rename, rather than showing a stale copy", async () => {
    const client = await freshMockClient();
    const created = await client.createReport({ name: "Original name" });
    await client.updateReport(created.id, { name: "Renamed report" });

    const workbooks = await client.listWorkbooks();
    const card = workbooks.find((w) => w.id === created.id);
    expect(card!.name).toBe("Renamed report");
  });

  it("removes the Home-page card when the report is deleted", async () => {
    const client = await freshMockClient();
    const created = await client.createReport({ name: "Short-lived report" });
    expect((await client.listWorkbooks()).some((w) => w.id === created.id)).toBe(true);

    await client.deleteReport(created.id);
    expect((await client.listWorkbooks()).some((w) => w.id === created.id)).toBe(false);
  });

  it("resolves a report id through getWorkbook the same way an exploration id does", async () => {
    const client = await freshMockClient();
    const created = await client.createReport({ name: "Fetch me by workbook id" });

    const card = await client.getWorkbook(created.id);
    expect(card.name).toBe("Fetch me by workbook id");
    expect(card.kind).toBe("report");
  });

  it("records a view against the report itself when the id belongs to a report, not an exploration", async () => {
    const client = await freshMockClient();
    const created = await client.createReport({ name: "View me" });
    expect(created.views).toBe(0);

    await client.recordWorkbookView(created.id);

    const updated = await client.getReport(created.id);
    expect(updated.views).toBe(1);
    const card = (await client.listWorkbooks()).find((w) => w.id === created.id);
    expect(card!.views).toBe(1);
  });
});

describe("runQuery filters", () => {
  it("restricts a preset result's rows to those matching an eq filter on a real column", async () => {
    const client = await freshMockClient();
    const unfiltered = await client.runQuery({ dimensions: ["channel"] });
    expect(unfiltered.rows.length).toBeGreaterThan(1);

    const filtered = await client.runQuery({
      dimensions: ["channel"],
      filters: [{ column: "channel", operator: "eq", value: "Meta Ads" }],
    });
    expect(filtered.rows).toHaveLength(1);
    expect(filtered.rows[0].channel).toBe("Meta Ads");
  });

  it("matches eq case-insensitively, since a typed filter value shouldn't have to match casing exactly", async () => {
    const client = await freshMockClient();
    const filtered = await client.runQuery({
      dimensions: ["channel"],
      filters: [{ column: "channel", operator: "eq", value: "meta ads" }],
    });
    expect(filtered.rows).toHaveLength(1);
  });

  it("leaves the result untouched when the filter names a column it doesn't have, instead of erroring or zeroing it", async () => {
    const client = await freshMockClient();
    const result = await client.runQuery({ metricIds: ["met_revenue"] });
    const filtered = await client.runQuery({
      metricIds: ["met_revenue"],
      filters: [{ column: "channel", operator: "eq", value: "Meta Ads" }],
    });
    expect(filtered.rows).toEqual(result.rows);
  });
});

describe("idempotent sync retries", () => {
  it("reuses the same idempotency key across retries and lands on the true row count, not a cumulative sum", async () => {
    const client = await freshMockClient();
    const sources = await client.listDataSources();
    const failing = sources.find((s) => s.status === "error");
    expect(failing).toBeDefined();

    const firstRetry = await client.retrySync(failing!.id);
    const secondRetry = await client.retrySync(failing!.id);

    expect(secondRetry.idempotencyKey).toBe(firstRetry.idempotencyKey);
    expect(secondRetry.attempt).toBe(firstRetry.attempt + 1);
    // Same target row count both times, proving this is a fresh upsert-to-true-total
    // each time rather than adding this attempt's rows on top of the last one's.
    expect(secondRetry.rowsUpserted).toBe(firstRetry.rowsUpserted);

    const runs = await client.listSyncRuns(failing!.id);
    expect(runs.length).toBeGreaterThanOrEqual(2);
    expect(new Set(runs.map((r) => r.idempotencyKey)).size).toBe(1);
  });

  it("throws for a source id that doesn't exist rather than silently succeeding", async () => {
    const client = await freshMockClient();
    await expect(client.retrySync("src_does_not_exist")).rejects.toMatchObject({ status: 404 });
  });
});

describe("updateExperiment", () => {
  it("updates a draft experiment's fields in place", async () => {
    const client = await freshMockClient();
    const before = await client.getExperiment("exp_google_pause");
    expect(before.status).toBe("draft");

    const updated = await client.updateExperiment("exp_google_pause", { name: "Renamed draft" });
    expect(updated.name).toBe("Renamed draft");
    // Fields not passed in the update are left untouched.
    expect(updated.hypothesis).toBe(before.hypothesis);

    const refetched = await client.getExperiment("exp_google_pause");
    expect(refetched.name).toBe("Renamed draft");
  });

  it("also updates a running (non-draft) experiment's fields", async () => {
    const client = await freshMockClient();
    const running = await client.getExperiment("exp_email_frequency");
    expect(running.status).toBe("running");

    const updated = await client.updateExperiment("exp_email_frequency", { name: "Renamed while running" });
    expect(updated.name).toBe("Renamed while running");
    expect(updated.status).toBe("running");
  });

  it("throws for an experiment id that doesn't exist rather than silently succeeding", async () => {
    const client = await freshMockClient();
    await expect(client.updateExperiment("exp_does_not_exist", { name: "X" })).rejects.toMatchObject({ status: 404 });
  });
});

describe("deleteWorkbook", () => {
  it("removes a created exploration from both listWorkbooks and getWorkbook", async () => {
    const client = await freshMockClient();
    const created = await client.createWorkbook({
      name: "Short-lived exploration",
      query: { source: "metric", key: "met_revenue" },
    });
    expect((await client.listWorkbooks()).some((w) => w.id === created.id)).toBe(true);

    await client.deleteWorkbook(created.id);

    expect((await client.listWorkbooks()).some((w) => w.id === created.id)).toBe(false);
    await expect(client.getWorkbook(created.id)).rejects.toMatchObject({ status: 404 });
  });

  it("leaves a report's Home-page card alone — deleteReport is the one for those, not this", async () => {
    const client = await freshMockClient();
    const report = await client.createReport({ name: "Not an exploration" });

    await client.deleteWorkbook(report.id);

    expect((await client.listWorkbooks()).some((w) => w.id === report.id)).toBe(true);
  });
});

describe("deleteExperiment", () => {
  it("removes an experiment from listExperiments and getExperiment", async () => {
    const client = await freshMockClient();
    expect((await client.listExperiments()).some((e) => e.id === "exp_google_pause")).toBe(true);

    await client.deleteExperiment("exp_google_pause");

    expect((await client.listExperiments()).some((e) => e.id === "exp_google_pause")).toBe(false);
    await expect(client.getExperiment("exp_google_pause")).rejects.toMatchObject({ status: 404 });
  });
});
