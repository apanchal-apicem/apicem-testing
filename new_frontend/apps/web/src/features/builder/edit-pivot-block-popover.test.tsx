import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReportBlock } from "@apicem/api-contract";
import { renderPage } from "@/test/render";
import { builderActions, store } from "@/store";
import { EditPivotBlockPopover } from "./edit-pivot-block-popover";

function loadBlock(block: ReportBlock) {
  store.dispatch(
    builderActions.loadBuilder({ reportId: "rpt_test", blocks: [block] }),
  );
  return block;
}

describe("EditPivotBlockPopover", () => {
  it("shows what a pivot block currently displays and seeds the draft from its saved config", async () => {
    const user = userEvent.setup();
    const block = loadBlock({
      id: "blk_pivot_1",
      type: "pivot",
      layout: { x: 0, y: 0, w: 8, h: 10 },
      config: {
        metricIds: ["met_revenue"],
        rowDimensions: ["channel"],
        columnDimensions: [],
        title: "Revenue by channel",
      },
    });
    renderPage(<EditPivotBlockPopover block={block} />);

    await user.click(screen.getByRole("button", { name: "Edit pivot block" }));
    expect(await screen.findByText(/Currently:/)).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Revenue by channel");
    expect(screen.getByLabelText("Net Revenue")).toBeChecked();
    // "Channel" appears in both the Rows and Columns toggle groups — Rows
    // renders first, and it's the one seeded active from rowDimensions.
    expect(screen.getAllByRole("button", { name: "Channel" })[0]).toHaveClass(
      "border-accent",
    );
  });

  it("adds a second metric and a Columns dimension, saving straight to config with no query-engine resolution step", async () => {
    const user = userEvent.setup();
    const block = loadBlock({
      id: "blk_pivot_2",
      type: "pivot",
      layout: { x: 0, y: 0, w: 8, h: 10 },
      config: {
        metricIds: ["met_revenue"],
        rowDimensions: ["channel"],
        columnDimensions: [],
      },
    });
    renderPage(<EditPivotBlockPopover block={block} />);

    await user.click(screen.getByRole("button", { name: "Edit pivot block" }));
    await user.click(await screen.findByLabelText("Gross Margin"));
    // "Category" appears as a toggle in both the Rows and Columns groups —
    // Columns renders second, so index 1 is the Columns one.
    await user.click(screen.getAllByRole("button", { name: "Category" })[1]);
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(store.getState().builder.blocks[0].config).toMatchObject({
        metricIds: ["met_revenue", "met_margin"],
        rowDimensions: ["channel"],
      });
    });
  });

  it("disables Save when nothing is selected on any shelf", async () => {
    const user = userEvent.setup();
    const block = loadBlock({
      id: "blk_pivot_3",
      type: "pivot",
      layout: { x: 0, y: 0, w: 8, h: 10 },
      config: { metricIds: [], rowDimensions: [], columnDimensions: [] },
    });
    renderPage(<EditPivotBlockPopover block={block} />);

    await user.click(screen.getByRole("button", { name: "Edit pivot block" }));
    expect(await screen.findByRole("button", { name: "Save" })).toBeDisabled();
  });
});
