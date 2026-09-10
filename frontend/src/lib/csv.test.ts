import { describe, expect, it } from "vitest";
import { dashboardToCsv, widgetToCsv } from "./csv";
import type { DashboardOut } from "../api/client";

const dashboard: DashboardOut = {
  id: "executive_overview",
  title: "Executive Overview",
  date_note: "Last 7 days",
  widgets: [
    {
      type: "kpi",
      metric: "gross_revenue",
      label: "Gross Revenue",
      value: 14992.24,
      previous_value: 12000,
      delta_pct: 0.2493,
      is_estimated: false,
    },
    {
      type: "table",
      metric: "top_products",
      label: "Top Products",
      is_estimated: false,
      rows: [
        // A product name containing a comma and embedded quotes is exactly the case
        // csvEscape exists for -- a naive join(",") would silently corrupt this row.
        { product_name: 'Widget, "Deluxe"', revenue: 500 },
      ],
    },
  ],
};

describe("dashboardToCsv", () => {
  it("quotes a field containing a comma and doubles embedded quotes", () => {
    const csv = dashboardToCsv(dashboard, "Aug 24 – Aug 31");
    expect(csv).toContain('"Widget, ""Deluxe"""');
  });

  it("includes a Summary section with raw (unformatted) KPI numbers", () => {
    const csv = dashboardToCsv(dashboard, "Aug 24 – Aug 31");
    expect(csv).toContain("Summary");
    expect(csv).toContain("Gross Revenue,14992.24,12000,24.9");
  });

  it("titles the CSV with the dashboard name and range label", () => {
    const csv = dashboardToCsv(dashboard, "Aug 24 – Aug 31");
    expect(csv.split("\n")[0]).toBe("Executive Overview - Aug 24 – Aug 31");
  });
});

describe("widgetToCsv", () => {
  it("exports just the one widget's rows, not the whole dashboard", () => {
    const csv = widgetToCsv(dashboard.widgets[1], "Executive Overview", "Aug 24 – Aug 31");
    expect(csv).toContain("Top Products");
    expect(csv).not.toContain("Gross Revenue");
  });
});
