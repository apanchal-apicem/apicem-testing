import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPage } from "@/test/render";
import { ReportBuilderPage } from "./report-builder-page";

describe("ReportBuilderPage", () => {
  it("loads a seeded report's blocks onto the canvas and shows it as saved", async () => {
    renderPage(<ReportBuilderPage />, { path: "/reports/:reportId", route: "/reports/rpt_board_deck" });

    expect(await screen.findByText("Board Deck (Q3)")).toBeInTheDocument();
    expect(screen.getByText("All changes saved")).toBeInTheDocument();
    // The Save button should be disabled until something actually changes.
    expect(screen.getByRole("button", { name: /Save/ })).toBeDisabled();
  });

  /**
   * Dragging to move/resize a block has no keyboard equivalent, so the
   * block frame itself is a focusable, arrow-key-operable control (see
   * block-frame.tsx). These guard the actual keyboard path, not just that
   * the ARIA label reads correctly.
   */
  it("moves the focused block with arrow keys and marks the report dirty", async () => {
    const user = userEvent.setup();
    renderPage(<ReportBuilderPage />, { path: "/reports/:reportId", route: "/reports/rpt_board_deck" });
    await screen.findByText("Board Deck (Q3)");

    const [firstKpi] = screen.getAllByRole("group", { name: "kpi block" });
    const before = (firstKpi as HTMLElement).style.left;

    await user.click(firstKpi);
    await user.keyboard("{ArrowRight}");

    expect((firstKpi as HTMLElement).style.left).not.toBe(before);
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  });

  it("removes the focused block on Delete", async () => {
    const user = userEvent.setup();
    renderPage(<ReportBuilderPage />, { path: "/reports/:reportId", route: "/reports/rpt_board_deck" });
    await screen.findByText("Board Deck (Q3)");

    const before = screen.getAllByRole("group", { name: "kpi block" });
    await user.click(before[0]);
    await user.keyboard("{Delete}");

    expect(screen.getAllByRole("group", { name: "kpi block" })).toHaveLength(before.length - 1);
  });

  it("adds a pivot block from the palette with a real default config, rendered through the query engine", async () => {
    const user = userEvent.setup();
    renderPage(<ReportBuilderPage />, { path: "/reports/:reportId", route: "/reports/rpt_board_deck" });
    await screen.findByText("Board Deck (Q3)");

    await user.click(screen.getByRole("button", { name: "Pivot" }));

    expect(screen.getByRole("group", { name: /pivot block/ })).toBeInTheDocument();
    expect(await screen.findByText("New pivot table")).toBeInTheDocument();
    expect(await screen.findByText("Meta Ads")).toBeInTheDocument();
  });

  it("does not remove the block when Backspace is pressed inside its own text field", async () => {
    const user = userEvent.setup();
    renderPage(<ReportBuilderPage />, { path: "/reports/:reportId", route: "/reports/rpt_board_deck" });
    await screen.findByText("Board Deck (Q3)");

    // Matched loosely: the frame's own aria-label appends ", selected..."
    // once it's focused, which clicking into its text field also triggers.
    expect(screen.getByRole("group", { name: /text block/ })).toBeInTheDocument();
    const noteField = screen.getByPlaceholderText("Write a note…");
    await user.click(noteField);
    await user.keyboard("{Backspace}");

    expect(screen.getByRole("group", { name: /text block/ })).toBeInTheDocument();
  });
});
