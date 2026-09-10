// Ports backend/app/dashboard_registry.py verbatim: dashboards defined once as metric+chart
// configs. Conditional rendering by connected source -- a dashboard only appears once the
// tenant has an active connection providing every capability it needs.
export const SOURCE_CAPABILITIES: Record<string, Set<string>> = {
  shopify: new Set(["ecommerce"]),
  google_ads: new Set(["advertising"]),
  meta_ads: new Set(["advertising"]),
  netsuite: new Set(["erp", "inventory"]),
};

export interface DashboardWidget {
  type: "kpi" | "trend" | "table";
  metric: string;
  label: string;
}

export interface Dashboard {
  id: string;
  title: string;
  requiredCapabilities: Set<string>;
  dateNote: string;
  widgets: DashboardWidget[];
}

export const DASHBOARDS: Dashboard[] = [
  {
    id: "executive_overview",
    title: "Executive Overview",
    requiredCapabilities: new Set(["ecommerce"]),
    dateNote: "Dates reflect the order date -- a sale counts on the day it was placed, within the selected range.",
    widgets: [
      { type: "kpi", metric: "gross_revenue", label: "Gross Revenue" },
      { type: "kpi", metric: "net_revenue", label: "Net Revenue" },
      { type: "kpi", metric: "order_count", label: "Orders" },
      { type: "kpi", metric: "new_customer_count", label: "New Customers" },
      { type: "kpi", metric: "gross_margin_pct", label: "Gross Margin %" },
      { type: "trend", metric: "revenue_trend", label: "Revenue Trend" },
      // Reuses the same metric Product Performance already computes -- an executive summary
      // naming top products is a standard second section, not new computation.
      { type: "table", metric: "top_products", label: "Top Products by Revenue" },
    ],
  },
  {
    id: "revenue",
    title: "Revenue",
    requiredCapabilities: new Set(["ecommerce"]),
    dateNote: "Dates reflect the order date -- a sale counts on the day it was placed, within the selected range.",
    widgets: [
      { type: "kpi", metric: "gross_revenue", label: "Gross Revenue" },
      { type: "kpi", metric: "net_revenue", label: "Net Revenue" },
      { type: "kpi", metric: "aov", label: "Average Order Value" },
      { type: "kpi", metric: "total_discounts", label: "Total Discounts" },
      { type: "kpi", metric: "total_refunds", label: "Total Refunds" },
      { type: "trend", metric: "revenue_trend", label: "Revenue Trend" },
      { type: "trend", metric: "discounts_refunds_trend", label: "Discounts & Refunds Trend" },
    ],
  },
  {
    id: "product_performance",
    title: "Product Performance",
    requiredCapabilities: new Set(["ecommerce"]),
    dateNote: "Dates reflect the order date -- a sale counts on the day it was placed, within the selected range.",
    widgets: [{ type: "table", metric: "top_products", label: "Top Products by Revenue" }],
  },
  {
    id: "marketing_performance",
    title: "Marketing Performance",
    requiredCapabilities: new Set(["advertising"]),
    dateNote:
      "Dates reflect the ad platform's own report date -- spend and clicks count on the day the platform reported them, which can differ from order date.",
    widgets: [
      { type: "kpi", metric: "total_ad_spend", label: "Total Ad Spend" },
      { type: "kpi", metric: "total_conversions", label: "Conversions" },
      { type: "kpi", metric: "blended_roas", label: "Blended ROAS" },
      { type: "trend", metric: "ad_spend_trend", label: "Ad Spend Trend" },
      // Same table Advertising ROI shows -- a marketing summary naming which campaigns are
      // actually driving that spend is the natural second section.
      { type: "table", metric: "campaign_performance", label: "Campaign Performance" },
    ],
  },
  {
    id: "advertising_roi",
    title: "Advertising ROI",
    requiredCapabilities: new Set(["advertising"]),
    dateNote:
      "Dates reflect the ad platform's own report date -- spend and clicks count on the day the platform reported them, which can differ from order date.",
    widgets: [
      { type: "kpi", metric: "blended_roas", label: "Blended ROAS" },
      { type: "kpi", metric: "blended_cpa", label: "Blended CPA" },
      { type: "kpi", metric: "blended_ctr", label: "Blended CTR" },
      { type: "table", metric: "campaign_performance", label: "Campaign Performance" },
    ],
  },
  {
    id: "inventory",
    title: "Inventory",
    requiredCapabilities: new Set(["inventory"]),
    dateNote:
      "Inventory numbers are a snapshot as of the end of the selected range, not summed across it -- moving the start date won't change these values.",
    widgets: [
      { type: "kpi", metric: "total_inventory_value", label: "Inventory Value" },
      { type: "kpi", metric: "total_units_on_hand", label: "Units on Hand" },
      { type: "kpi", metric: "low_stock_count", label: "Low Stock Products" },
      { type: "table", metric: "inventory_by_product", label: "Inventory by Product" },
    ],
  },
];

export function availableCapabilities(connectionSourceTypes: Iterable<string>): Set<string> {
  const capabilities = new Set<string>();
  for (const sourceType of connectionSourceTypes) {
    for (const cap of SOURCE_CAPABILITIES[sourceType] ?? []) capabilities.add(cap);
  }
  return capabilities;
}

function isSubset(subset: Set<string>, superset: Set<string>): boolean {
  for (const item of subset) if (!superset.has(item)) return false;
  return true;
}

export function dashboardsForCapabilities(capabilities: Set<string>): Dashboard[] {
  return DASHBOARDS.filter((d) => isSubset(d.requiredCapabilities, capabilities));
}

export function getDashboard(dashboardId: string): Dashboard | null {
  return DASHBOARDS.find((d) => d.id === dashboardId) ?? null;
}
