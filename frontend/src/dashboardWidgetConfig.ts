import type { MetricTableColumn } from "./components/MetricTable";
import type { TrendSeries } from "./components/TrendChart";
import { sourceTypeConfig } from "./sourceTypes";

// Palette per the dataviz skill's validated categorical order (slot 1 blue, slot 2 orange) --
// same pair already used for gross/net revenue, reused here for spend-by-platform so both
// trend charts read consistently.
export const TREND_SERIES_CONFIG: Record<string, TrendSeries[]> = {
  revenue_trend: [
    { key: "gross_revenue", label: "Gross revenue", color: "var(--series-1)" },
    { key: "net_revenue", label: "Net revenue", color: "var(--series-2)" },
  ],
  ad_spend_trend: [
    { key: "google_ads_spend", label: "Google Ads", color: "var(--series-1)" },
    { key: "meta_ads_spend", label: "Meta Ads", color: "var(--series-2)" },
  ],
  discounts_refunds_trend: [
    { key: "discounts", label: "Discounts", color: "var(--series-1)" },
    { key: "refund_amount", label: "Refunds", color: "var(--series-2)" },
  ],
};

export const TABLE_COLUMNS_CONFIG: Record<string, MetricTableColumn[]> = {
  top_products: [
    { key: "product_name", label: "Product" },
    { key: "category", label: "Category" },
    { key: "units", label: "Units sold", numeric: true },
    { key: "revenue", label: "Revenue", numeric: true },
  ],
  campaign_performance: [
    { key: "campaign_name", label: "Campaign" },
    {
      key: "source_system",
      label: "Platform",
      // source_system holds the internal id ("google_ads") -- reuse the same display
      // names the Connections page already defines instead of showing that raw string.
      formatter: (v) => sourceTypeConfig(String(v))?.label ?? String(v),
    },
    { key: "spend", label: "Spend", numeric: true },
    { key: "conversions", label: "Conversions", numeric: true },
    { key: "roas", label: "ROAS", numeric: true },
    { key: "cpa", label: "CPA", numeric: true },
  ],
  inventory_by_product: [
    { key: "product_name", label: "Product" },
    { key: "sku", label: "SKU" },
    { key: "quantity_on_hand", label: "On hand", numeric: true },
    { key: "quantity_available", label: "Available", numeric: true },
    { key: "inventory_value", label: "Value", numeric: true },
  ],
};
