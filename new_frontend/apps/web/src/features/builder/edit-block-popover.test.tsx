import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReportBlock } from "@apicem/api-contract";
import { renderPage } from "@/test/render";
import { useBuilderStore } from "@/stores/builder";
import { EditBlockPopover } from "./edit-block-popover";

function loadBlock(block: ReportBlock) {
  useBuilderStore.getState().load("rpt_test", [block]);
  return block;
}

describe("EditBlockPopover", () => {
  it("shows what a KPI block currently displays, and only offers metrics (no breakdowns) to switch to", async () => {
    const user = userEvent.setup();
    const block = loadBlock({
      id: "blk_kpi_1",
      type: "kpi",
      layout: { x: 0, y: 0, w: 4, h: 4 },
      config: { metricId: "met_revenue", label: "Net Revenue" },
    });
    renderPage(<EditBlockPopover block={block} />);

    await user.click(screen.getByRole("button", { name: "Edit kpi block" }));
    expect(await screen.findByText(/Currently:/)).toBeInTheDocument();
    expect(screen.getByLabelText("Label")).toHaveValue("Net Revenue");

    await user.click(screen.getByRole("combobox"));
    expect(await screen.findByRole("option", { name: "Net Revenue" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Breakdown by/ })).not.toBeInTheDocument();
  });

  it("switches a chart block to a different metric and saves it to the block's config", async () => {
    const user = userEvent.setup();
    const block = loadBlock({
      id: "blk_chart_1",
      type: "chart",
      layout: { x: 0, y: 0, w: 6, h: 6 },
      config: { source: "metric", key: "met_revenue", chartType: "line", title: "Revenue" },
    });
    renderPage(<EditBlockPopover block={block} />);

    await user.click(screen.getByRole("button", { name: "Edit chart block" }));
    // Unchecks the currently-selected metric (seeded from the block's
    // existing config) and checks a different one, ending with a single
    // metric selected rather than adding to it.
    await user.click(await screen.findByLabelText("Net Revenue"));
    await user.click(screen.getByLabelText("Gross Margin"));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(useBuilderStore.getState().blocks[0].config).toMatchObject({ source: "metric", key: "met_margin" });
    });
  });

  it("switches a table block to a dimension breakdown, resolving it to the real preset key through the query engine", async () => {
    const user = userEvent.setup();
    const block = loadBlock({
      id: "blk_table_1",
      type: "table",
      layout: { x: 0, y: 0, w: 6, h: 6 },
      config: { source: "preset", key: "top_products", title: "Top products" },
    });
    renderPage(<EditBlockPopover block={block} />);

    await user.click(screen.getByRole("button", { name: "Edit table block" }));
    await user.click(await screen.findByRole("button", { name: "Channel" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    // Resolving a dimension into its actual preset key is a real request
    // through the mock query engine (simulated latency and all) — the click
    // above only awaits its own dispatch, not that request finishing.
    await waitFor(() => {
      expect(useBuilderStore.getState().blocks[0].config).toMatchObject({ source: "preset", key: "cac_channel" });
    });
  });

  it("selects two metrics and a dimension together, resolving to a metric-by-dimension composite key", async () => {
    const user = userEvent.setup();
    const block = loadBlock({
      id: "blk_chart_2",
      type: "chart",
      layout: { x: 0, y: 0, w: 6, h: 6 },
      config: { source: "metric", key: "met_revenue", chartType: "bar", title: "Revenue" },
    });
    renderPage(<EditBlockPopover block={block} />);

    await user.click(screen.getByRole("button", { name: "Edit chart block" }));
    // "Net Revenue" is already checked (seeded from the block's existing
    // config) — adds "Gross Margin" alongside it rather than replacing it.
    await user.click(await screen.findByLabelText("Gross Margin"));
    await user.click(screen.getByRole("button", { name: "Channel" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(useBuilderStore.getState().blocks[0].config).toMatchObject({
        source: "preset",
        key: "bydim:met_revenue,met_margin:channel",
      });
    });
  });

  it("selects two metrics and two dimensions together, keeping both metrics in the cross-tab rather than dropping one", async () => {
    const user = userEvent.setup();
    const block = loadBlock({
      id: "blk_chart_3",
      type: "chart",
      layout: { x: 0, y: 0, w: 6, h: 6 },
      config: { source: "metric", key: "met_revenue", chartType: "bar", title: "Revenue" },
    });
    renderPage(<EditBlockPopover block={block} />);

    await user.click(screen.getByRole("button", { name: "Edit chart block" }));
    await user.click(await screen.findByLabelText("Gross Margin"));
    await user.click(screen.getByRole("button", { name: "Channel" }));
    await user.click(screen.getByRole("button", { name: "Category" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(useBuilderStore.getState().blocks[0].config).toMatchObject({
        source: "preset",
        key: "crosstab:met_revenue,met_margin:channel,category",
      });
    });
  });

  it("selects more than two dimensions and more than six metrics, with no cap on either", async () => {
    const user = userEvent.setup();
    const block = loadBlock({
      id: "blk_chart_4",
      type: "chart",
      layout: { x: 0, y: 0, w: 6, h: 6 },
      config: { source: "metric", key: "met_revenue", chartType: "bar", title: "Revenue" },
    });
    renderPage(<EditBlockPopover block={block} />);

    await user.click(screen.getByRole("button", { name: "Edit chart block" }));
    // "Net Revenue" is already checked; add every other metric on top of
    // it — seven total, one more than the old 6-metric cap allowed.
    await user.click(await screen.findByLabelText("Gross Margin"));
    await user.click(screen.getByLabelText("Customer Acquisition Cost"));
    await user.click(screen.getByLabelText("Customer Lifetime Value"));
    await user.click(screen.getByLabelText("Return on Ad Spend"));
    await user.click(screen.getByLabelText("Repeat Purchase Rate"));
    await user.click(screen.getByLabelText("Average Order Value"));
    // All three available dimensions — the old cap stopped at two.
    await user.click(screen.getByRole("button", { name: "Channel" }));
    await user.click(screen.getByRole("button", { name: "Category" }));
    await user.click(screen.getByRole("button", { name: "Product" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(useBuilderStore.getState().blocks[0].config).toMatchObject({
        source: "preset",
        key: "crosstab:met_revenue,met_margin,met_cac,met_ltv,met_roas,met_repeat_rate,met_aov:channel,category,product",
      });
    });
  });

  it("doesn't offer a chart-type switcher for a table block", async () => {
    const user = userEvent.setup();
    const block = loadBlock({
      id: "blk_table_2",
      type: "table",
      layout: { x: 0, y: 0, w: 6, h: 6 },
      config: { source: "preset", key: "top_products", title: "Top products" },
    });
    renderPage(<EditBlockPopover block={block} />);

    await user.click(screen.getByRole("button", { name: "Edit table block" }));
    expect(screen.queryByText("Chart type")).not.toBeInTheDocument();
  });
});
