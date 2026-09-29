import { describe, expect, it } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderPage } from "@/test/render";
import { ExplorePage } from "./explore-page";

/** Simulates dropping a field chip (see field-chip.tsx's onDragStart) onto a Shelf — jsdom has no real HTML5 drag-and-drop to drive with userEvent. */
function dropField(target: Element, field: { kind: "metric" | "dimension"; id: string; label: string }) {
  fireEvent.drop(target, { dataTransfer: { getData: () => JSON.stringify(field) } });
}

describe("ExplorePage", () => {
  it("renders the Ask tab with starter questions by default", async () => {
    renderPage(<ExplorePage />);
    expect(screen.getByText("Ask your data anything")).toBeInTheDocument();
    expect(await screen.findByText(/How has net revenue trended/)).toBeInTheDocument();
  });

  it("resolves a typed question to a real result via the actual mock query engine", async () => {
    const user = userEvent.setup();
    renderPage(<ExplorePage />);

    const input = await screen.findByPlaceholderText(/Ask anything about your business/);
    await user.type(input, "How has net revenue trended over the last 12 weeks?");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    expect(await screen.findByText(/confident/)).toBeInTheDocument();
  });

  it("keeps every asked question visible as a running thread, not just the latest", async () => {
    const user = userEvent.setup();
    renderPage(<ExplorePage />);

    const input = await screen.findByPlaceholderText(/Ask anything about your business/);
    await user.type(input, "How has net revenue trended over the last 12 weeks?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(
      await screen.findByRole("heading", { name: "How has net revenue trended over the last 12 weeks?" }),
    ).toBeInTheDocument();

    await user.type(input, "What share of customers made a repeat purchase last quarter?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(
      await screen.findByRole("heading", { name: "What share of customers made a repeat purchase last quarter?" }),
    ).toBeInTheDocument();

    // The follow-up didn't replace the first answer — both are still there.
    expect(screen.getByRole("heading", { name: "How has net revenue trended over the last 12 weeks?" })).toBeInTheDocument();
  });

  it("switches to the Build tab and lists the workspace's real metrics as draggable fields", async () => {
    const user = userEvent.setup();
    renderPage(<ExplorePage />);

    await user.click(screen.getByRole("tab", { name: "Build manually" }));
    expect(await screen.findByText("Net Revenue")).toBeInTheDocument();
    expect(screen.getByText("Drag a metric into Value to see results")).toBeInTheDocument();
  });

  it("restricts a manually-built result to rows matching a dimension dragged onto the Filter shelf", async () => {
    const user = userEvent.setup();
    renderPage(<ExplorePage />);
    await user.click(screen.getByRole("tab", { name: "Build manually" }));

    // A metric is required before any result shows; with it picked, Channel
    // resolves the real cac_channel preset (5 rows).
    await user.click(await screen.findByText("Customer Acquisition Cost"));
    await user.click(await screen.findByText("Channel"));
    await user.click(await screen.findByRole("tab", { name: "Data" }));
    expect(await screen.findByText("Meta Ads")).toBeInTheDocument();
    expect(screen.getByText("Google Ads")).toBeInTheDocument();

    dropField(screen.getByText("Drag a dimension to filter"), { kind: "dimension", id: "channel", label: "Channel" });
    const filterValue = await screen.findByPlaceholderText("Value for Channel…");
    await user.type(filterValue, "Meta Ads");

    // The filter actually ran through the query engine, not just the UI —
    // every other channel's row is gone, not merely hidden.
    await screen.findByText("Meta Ads");
    expect(screen.queryByText("Google Ads")).not.toBeInTheDocument();
    expect(screen.queryByText("Organic Search")).not.toBeInTheDocument();
  });

  it("reopens a saved exploration by id instead of starting a blank one", async () => {
    renderPage(<ExplorePage />, { path: "/explore/:workbookId", route: "/explore/wb_revenue_overview" });

    // Its saved query (met_revenue) actually resolved to a real result.
    expect(await screen.findByText(/confident/)).toBeInTheDocument();
    // The workbook's own name becomes the page title, not the generic prompt.
    expect(screen.getAllByText("Revenue Overview").length).toBeGreaterThan(0);
    expect(screen.queryByText("Ask your data anything")).not.toBeInTheDocument();
  });

  it("lets an asked question be edited and rerun in place, replacing that turn rather than adding a new one", async () => {
    const user = userEvent.setup();
    renderPage(<ExplorePage />);

    const input = await screen.findByPlaceholderText(/Ask anything about your business/);
    await user.type(input, "How has net revenue trended over the last 12 weeks?");
    await user.click(screen.getByRole("button", { name: "Ask" }));
    expect(
      await screen.findByRole("heading", { name: "How has net revenue trended over the last 12 weeks?" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Edit question" }));
    const editInput = screen.getByDisplayValue("How has net revenue trended over the last 12 weeks?");
    await user.clear(editInput);
    await user.type(editInput, "what's our cac looking like");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("heading", { name: "what's our cac looking like" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "How has net revenue trended over the last 12 weeks?" })).not.toBeInTheDocument();
  });

  it("selects multiple metrics and dimensions on the Build tab's shelves, with no cap on either", async () => {
    const user = userEvent.setup();
    renderPage(<ExplorePage />);
    await user.click(screen.getByRole("tab", { name: "Build manually" }));

    await user.click(await screen.findByText("Net Revenue"));
    await user.click(screen.getByText("Customer Acquisition Cost"));
    expect(await screen.findByText("Net Revenue, Customer Acquisition Cost")).toBeInTheDocument();

    // Captured once and reused across every drop: after the first drop the
    // shelf's placeholder text (the only thing `getByText` could otherwise
    // re-find) is replaced by chips, but the underlying drop-target div is
    // the same node throughout.
    const groupShelf = screen.getByText("Drag dimensions here (optional)");
    dropField(groupShelf, { kind: "dimension", id: "channel", label: "Channel" });
    expect(await screen.findByRole("button", { name: "Remove Channel" })).toBeInTheDocument();

    dropField(groupShelf, { kind: "dimension", id: "category", label: "Category" });
    expect(await screen.findByRole("button", { name: "Remove Category" })).toBeInTheDocument();

    // A third dimension used to be rejected outright by the shelf's own
    // max={2} — now it's accepted and actually shows up in the breakdown.
    dropField(groupShelf, { kind: "dimension", id: "product", label: "Product" });
    expect(await screen.findByRole("button", { name: "Remove Product" })).toBeInTheDocument();
    expect(await screen.findByText(/Net Revenue, Customer Acquisition Cost broken down by Channel, Category, Product/)).toBeInTheDocument();
  });

  it("asks for a metric instead of silently defaulting to one, for any number of dimensions grouped with none picked", async () => {
    const user = userEvent.setup();
    renderPage(<ExplorePage />);
    await user.click(screen.getByRole("tab", { name: "Build manually" }));

    const groupShelf = await screen.findByText("Drag dimensions here (optional)");
    dropField(groupShelf, { kind: "dimension", id: "channel", label: "Channel" });
    expect(await screen.findByRole("button", { name: "Remove Channel" })).toBeInTheDocument();

    // Even a single dimension with no metric would otherwise silently
    // resolve to that dimension's own canned preset (e.g. Channel's is CAC
    // by channel) — a specific metric the user never actually picked.
    expect(await screen.findByText("Pick a metric to see it broken down by Channel")).toBeInTheDocument();

    dropField(groupShelf, { kind: "dimension", id: "category", label: "Category" });
    expect(await screen.findByRole("button", { name: "Remove Category" })).toBeInTheDocument();

    // 2+ dimensions with no metric would otherwise silently fall back to
    // the workspace's first metric (crossTabResult's own no-metric
    // fallback) — instead it keeps asking for one.
    expect(await screen.findByText("Pick a metric to see it broken down by Channel, Category")).toBeInTheDocument();

    await user.click(screen.getByText("Net Revenue"));
    expect(await screen.findByText(/Net Revenue broken down by Channel, Category/)).toBeInTheDocument();
  });

  it("asks for a metric instead of silently defaulting to one on the Pivot tab with only rows/columns picked", async () => {
    const user = userEvent.setup();
    renderPage(<ExplorePage />);
    await user.click(screen.getByRole("tab", { name: "Pivot table" }));

    await user.click(await screen.findByText("Channel"));
    expect(await screen.findByText("Pick a metric to see the pivot")).toBeInTheDocument();

    await user.click(screen.getByText("Net Revenue"));
    expect(await screen.findByText("Meta Ads")).toBeInTheDocument();
  });

  it("shows a metric's total on Single value and Table, and an explicit prompt on Line, when no dimension is grouped", async () => {
    const user = userEvent.setup();
    renderPage(<ExplorePage />);
    await user.click(screen.getByRole("tab", { name: "Build manually" }));

    await user.click(await screen.findByText("Net Revenue"));

    // The recommended chart type for a bare metric is Line, which would
    // otherwise fabricate a "grouped by week" trend nobody asked to see.
    expect(
      await screen.findByText("Add a dimension to Group by to chart this — or switch to Single value to see the total."),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Single value" }));
    // The metric's real 12-week history sums into one honest headline
    // number instead of an arbitrary "last week" value.
    expect(await screen.findByText(/^\$[\d.]+K$/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Table" }));
    expect(await screen.findByText("Total")).toBeInTheDocument();
    expect(screen.getByText(/^\$[\d.]+K$/)).toBeInTheDocument();
  });

  it("tiles a Single value per metric with metric-filter chips, averaging a percent metric instead of summing it", async () => {
    const user = userEvent.setup();
    renderPage(<ExplorePage />);
    await user.click(screen.getByRole("tab", { name: "Build manually" }));

    await user.click(await screen.findByText("Net Revenue"));
    await user.click(screen.getByText("Gross Margin"));
    await user.click(await screen.findByRole("button", { name: "Single value" }));

    // Two tiles, one per metric — not one tile silently showing only the
    // first metric, and not their sums crammed into a single tile.
    expect(await screen.findByText(/^\$[\d.]+K$/)).toBeInTheDocument();
    // Gross Margin is a percent-formatted metric: summing its 12 weekly
    // values would be meaningless, so its tile averages them instead —
    // still a plausible percentage, not a number like "700".
    expect(await screen.findByText(/^\d{1,3}\.\d%$/)).toBeInTheDocument();

    // The metric-filter chip narrows to just Gross Margin, collapsing to
    // one tile — distinguished from the Metrics sidebar's own "Gross
    // Margin" field chip (which has no aria-pressed) by that attribute.
    const grossMarginChip = screen
      .getAllByRole("button", { name: "Gross Margin" })
      .find((b) => b.hasAttribute("aria-pressed"))!;
    await user.click(grossMarginChip);
    expect(screen.queryByText(/^\$[\d.]+K$/)).not.toBeInTheDocument();
    expect(screen.getByText(/^\d{1,3}\.\d%$/)).toBeInTheDocument();
  });

  it("seeds the Build tab with the original metric when reopening a manually-built exploration", async () => {
    const user = userEvent.setup();
    renderPage(<ExplorePage />, { path: "/explore/:workbookId", route: "/explore/wb_revenue_overview" });

    expect(await screen.findByText(/confident/)).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Build manually" }));

    // "Net Revenue" already sits on the Value shelf as a removable chip,
    // decoded from the workbook's saved {source: "metric", key: "met_revenue"}.
    expect(await screen.findByRole("button", { name: "Remove Net Revenue" })).toBeInTheDocument();
  });

  it("tags a reopened exploration with no saved question as built manually, and still takes follow-ups", async () => {
    const user = userEvent.setup();
    renderPage(<ExplorePage />, { path: "/explore/:workbookId", route: "/explore/wb_revenue_overview" });

    expect(await screen.findByText(/confident/)).toBeInTheDocument();
    // wb_revenue_overview's fixture query carries no `question`, so the
    // reopened turn is labeled rather than presented as something asked.
    expect(screen.getByText("Built manually")).toBeInTheDocument();

    const input = await screen.findByPlaceholderText(/Ask a follow-up/);
    await user.type(input, "What's our customer acquisition cost by channel this month?");
    await user.click(screen.getByRole("button", { name: "Ask" }));

    expect(
      await screen.findByRole("heading", { name: "What's our customer acquisition cost by channel this month?" }),
    ).toBeInTheDocument();
    // The reopened turn is still there alongside the follow-up.
    expect(screen.getAllByText("Revenue Overview").length).toBeGreaterThan(0);
  });

  it("builds a real pivot table from independent Values, Rows, and Columns shelves with no cap on any of them", async () => {
    const user = userEvent.setup();
    renderPage(<ExplorePage />);
    await user.click(screen.getByRole("tab", { name: "Pivot table" }));

    // Two metrics and two row dimensions via click (defaults to Rows) —
    // nothing here should be capped the way Build tab's shelves are.
    await user.click(await screen.findByText("Net Revenue"));
    await user.click(screen.getByText("Gross Margin"));
    await user.click(screen.getByText("Channel"));
    await user.click(screen.getByText("Product"));
    // Category is dragged onto Columns specifically, pivoting it into headers.
    dropField(screen.getByText("Drag dimensions here to pivot into columns"), { kind: "dimension", id: "category", label: "Category" });

    // Two metric sub-columns under each of the 4 category column groups.
    expect(await screen.findByText("Outerwear")).toBeInTheDocument();
    expect(screen.getAllByText("Net Revenue").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Gross Margin").length).toBeGreaterThan(1);
    // A grand-total row still renders at the bottom.
    expect(screen.getByText("Total")).toBeInTheDocument();
  });
});
