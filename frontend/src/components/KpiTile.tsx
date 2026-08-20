import type { ReactNode } from "react";
import { formatCount, formatCurrency, formatPercent, formatRatio } from "../lib/format";
import {
  IconAlertTriangle,
  IconDatabaseZap,
  IconMegaphone,
  IconRefresh,
  IconShoppingBag,
  IconTag,
  IconTarget,
  IconTrendingDown,
  IconTrendingUp,
  IconUsers,
} from "./icons";
import { Sparkline } from "./Sparkline";

interface KpiTileProps {
  label: string;
  value: number | null | undefined;
  deltaPct?: number | null;
  format: "currency" | "count" | "percent" | "ratio";
  metric: string;
  isEstimated?: boolean;
  /** Daily values for the same period, when a matching trend widget on the same dashboard
   * already fetched them -- reused as-is rather than issuing a second query per KPI. */
  sparklineData?: number[];
}

function formatValue(value: number | null | undefined, format: KpiTileProps["format"]): string {
  if (format === "currency") return formatCurrency(value);
  if (format === "percent") return formatPercent(value);
  if (format === "ratio") return formatRatio(value);
  return formatCount(value);
}

const METRIC_FORMATS: Record<string, KpiTileProps["format"]> = {
  gross_revenue: "currency",
  net_revenue: "currency",
  order_count: "count",
  new_customer_count: "count",
  aov: "currency",
  total_discounts: "currency",
  total_refunds: "currency",
  gross_margin_pct: "percent",
  total_ad_spend: "currency",
  total_conversions: "count",
  blended_roas: "ratio",
  blended_cpa: "currency",
  blended_ctr: "percent",
  total_inventory_value: "currency",
  total_units_on_hand: "count",
  low_stock_count: "count",
};

// Chosen so no two tiles on the SAME dashboard ever share an icon (doc Sec 8.2's dashboards
// each combine 3-5 of these) -- e.g. inventory's three KPIs used to all show the same
// database icon, and "New Customers"/"Conversions" showed a generic grid icon that didn't
// mean anything. Revenue-flavored metrics keep trending-up (a growth multiple/figure reads
// naturally that way); everything else gets an icon tied to what it actually is.
const METRIC_ICONS: Record<string, ReactNode> = {
  gross_revenue: <IconTrendingUp size={14} />,
  net_revenue: <IconTrendingUp size={14} />,
  aov: <IconShoppingBag size={14} />,
  gross_margin_pct: <IconTarget size={14} />,
  order_count: <IconShoppingBag size={14} />,
  new_customer_count: <IconUsers size={14} />,
  total_discounts: <IconTag size={14} />,
  total_refunds: <IconRefresh size={14} />,
  total_ad_spend: <IconMegaphone size={14} />,
  total_conversions: <IconTarget size={14} />,
  blended_roas: <IconTrendingUp size={14} />,
  blended_cpa: <IconUsers size={14} />,
  blended_ctr: <IconTarget size={14} />,
  total_inventory_value: <IconTrendingUp size={14} />,
  total_units_on_hand: <IconDatabaseZap size={14} />,
  low_stock_count: <IconAlertTriangle size={14} />,
};

export function metricFormat(metric: string): KpiTileProps["format"] {
  return METRIC_FORMATS[metric] || "count";
}

function DeltaBadge({ deltaPct }: { deltaPct: number }) {
  const isUp = deltaPct >= 0;
  const pct = Math.abs(deltaPct * 100);
  const displayPct = pct >= 100 ? pct.toFixed(0) : pct.toFixed(1);
  return (
    <span className={`delta-badge ${isUp ? "up" : "down"}`}>
      {isUp ? <IconTrendingUp size={11} /> : <IconTrendingDown size={11} />}
      {displayPct}%
    </span>
  );
}

export function KpiTile({ label, value, deltaPct, format, metric, isEstimated, sparklineData }: KpiTileProps) {
  const isEmpty = value === null || value === undefined;
  const hasDelta = !isEmpty && deltaPct !== null && deltaPct !== undefined;
  return (
    <div className="kpi-tile">
      <div className="tile-top">
        <span className="label">{label}</span>
        <span className="icon-badge">{METRIC_ICONS[metric] || <IconTrendingUp size={14} />}</span>
      </div>
      <div className={`value ${isEmpty ? "is-empty" : ""}`}>{formatValue(value, format)}</div>
      {hasDelta && <DeltaBadge deltaPct={deltaPct} />}
      {isEstimated && isEmpty && <div className="estimated-badge">not available yet</div>}
      {!isEmpty && sparklineData && sparklineData.length >= 2 && (
        <div className="kpi-sparkline">
          <Sparkline data={sparklineData} color={deltaPct != null && deltaPct < 0 ? "var(--status-critical)" : "var(--brand)"} />
        </div>
      )}
    </div>
  );
}
