import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderPage } from "@/test/render";
import { apiClient } from "@/api/client";
import { ReportViewPage } from "./report-view-page";

describe("ReportViewPage", () => {
  it("renders a seeded report read-only, with an Edit button and no drag handles", async () => {
    renderPage(<ReportViewPage />, { path: "/reports/:reportId", route: "/reports/rpt_board_deck" });

    expect(await screen.findByText("Board Deck (Q3)")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument();
    // Blocks render without the builder's draggable frame semantics.
    expect(screen.queryByRole("group", { name: /kpi block/ })).not.toBeInTheDocument();
  });

  it("records a view against the report's Home-page card when opened", async () => {
    const before = (await apiClient.listWorkbooks()).find((w) => w.id === "rpt_board_deck")!;
    renderPage(<ReportViewPage />, { path: "/reports/:reportId", route: "/reports/rpt_board_deck" });
    await screen.findByText("Board Deck (Q3)");

    await waitFor(async () => {
      const after = (await apiClient.listWorkbooks()).find((w) => w.id === "rpt_board_deck")!;
      expect(after.views).toBe(before.views + 1);
    });
  });
});
