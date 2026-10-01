// Ports backend/app/metric_registry.py verbatim-SQL. Every metric is defined exactly once
// here and every dashboard widget/ad-hoc query goes through computeMetric() so no two call
// sites can silently compute "revenue" differently -- same single-source-of-truth principle
// as the Python version.
//
// RLS on marts.* already restricts every query to the caller's tenant, but tenant_id is
// filtered explicitly here too (defense in depth: application code must never rely on RLS as
// the only safeguard).
//
// Every query takes ($1=tenant_id, $2=start_date, $3=end_date) positionally -- SQLAlchemy's
// named :tenant_id/:start_date/:end_date bind params have no server-side equivalent in
// node-postgres, which only supports positional $1/$2/... placeholders.
import type { PgClient } from "./db.js";

export type MetricFormat = "currency" | "count" | "percent" | "ratio";

interface ScalarMetricDef {
  label: string;
  format: MetricFormat;
  isEstimated?: boolean;
  sql: string;
}

interface SeriesOrTableMetricDef {
  label: string;
  sql: string;
}

export const SCALAR_METRICS: Record<string, ScalarMetricDef> = {
  gross_revenue: {
    label: "Gross Revenue",
    format: "currency",
    sql: `SELECT coalesce(sum(gross_revenue), 0) AS value
          FROM marts.fct_revenue_daily
          WHERE tenant_id = $1 AND date_key BETWEEN $2 AND $3`,
  },
  net_revenue: {
    label: "Net Revenue",
    format: "currency",
    sql: `SELECT coalesce(sum(net_revenue), 0) AS value
          FROM marts.fct_revenue_daily
          WHERE tenant_id = $1 AND date_key BETWEEN $2 AND $3`,
  },
  order_count: {
    label: "Orders",
    format: "count",
    sql: `SELECT coalesce(sum(order_count), 0) AS value
          FROM marts.fct_revenue_daily
          WHERE tenant_id = $1 AND date_key BETWEEN $2 AND $3`,
  },
  total_discounts: {
    label: "Total Discounts",
    format: "currency",
    sql: `SELECT coalesce(sum(discounts), 0) AS value
          FROM marts.fct_revenue_daily
          WHERE tenant_id = $1 AND date_key BETWEEN $2 AND $3`,
  },
  total_refunds: {
    label: "Total Refunds",
    format: "currency",
    sql: `SELECT coalesce(sum(refund_amount), 0) AS value
          FROM marts.fct_revenue_daily
          WHERE tenant_id = $1 AND date_key BETWEEN $2 AND $3`,
  },
  new_customer_count: {
    label: "New Customers",
    format: "count",
    sql: `SELECT coalesce(sum(new_customer_count), 0) AS value
          FROM marts.fct_revenue_daily
          WHERE tenant_id = $1 AND date_key BETWEEN $2 AND $3`,
  },
  aov: {
    label: "Average Order Value",
    format: "currency",
    sql: `SELECT CASE WHEN coalesce(sum(order_count), 0) = 0 THEN 0
                      ELSE round(sum(net_revenue) / sum(order_count), 2) END AS value
          FROM marts.fct_revenue_daily
          WHERE tenant_id = $1 AND date_key BETWEEN $2 AND $3`,
  },
  gross_margin_pct: {
    label: "Gross Margin %",
    format: "percent",
    // cost_of_goods is only ever populated once an ERP source is connected -- Shopify alone
    // can't provide it, so this always reports as estimated/unavailable in the Shopify-only
    // MVP rather than silently showing 0%.
    isEstimated: true,
    sql: `SELECT CASE WHEN sum(gross_revenue) = 0 OR sum(cost_of_goods) IS NULL THEN NULL
                      ELSE round(sum(gross_margin) / sum(gross_revenue), 4) END AS value
          FROM marts.fct_orders
          WHERE tenant_id = $1 AND order_date_key BETWEEN $2 AND $3`,
  },
  repeat_customer_rate: {
    label: "Repeat Customer Rate",
    format: "percent",
    sql: `SELECT CASE WHEN coalesce(sum(order_count), 0) = 0 THEN 0
                      ELSE round((sum(order_count) - sum(new_customer_count))::numeric / sum(order_count), 4) END AS value
          FROM marts.fct_revenue_daily
          WHERE tenant_id = $1 AND date_key BETWEEN $2 AND $3`,
  },
  refund_rate_pct: {
    label: "Refund Rate %",
    format: "percent",
    sql: `SELECT CASE WHEN coalesce(sum(gross_revenue), 0) = 0 THEN 0
                      ELSE round(sum(refund_amount) / sum(gross_revenue), 4) END AS value
          FROM marts.fct_revenue_daily
          WHERE tenant_id = $1 AND date_key BETWEEN $2 AND $3`,
  },
  total_ad_spend: {
    label: "Total Ad Spend",
    format: "currency",
    sql: `SELECT coalesce(sum(spend), 0) AS value
          FROM marts.fct_ad_spend
          WHERE tenant_id = $1 AND date_key BETWEEN $2 AND $3`,
  },
  total_conversions: {
    label: "Conversions",
    format: "count",
    sql: `SELECT coalesce(sum(conversions), 0) AS value
          FROM marts.fct_ad_spend
          WHERE tenant_id = $1 AND date_key BETWEEN $2 AND $3`,
  },
  blended_roas: {
    label: "Blended ROAS",
    format: "ratio",
    sql: `SELECT CASE WHEN coalesce(sum(spend), 0) = 0 THEN NULL
                      ELSE round(sum(conversion_value) / sum(spend), 2) END AS value
          FROM marts.fct_ad_spend
          WHERE tenant_id = $1 AND date_key BETWEEN $2 AND $3`,
  },
  blended_cpa: {
    label: "Blended CPA",
    format: "currency",
    sql: `SELECT CASE WHEN coalesce(sum(conversions), 0) = 0 THEN NULL
                      ELSE round(sum(spend) / sum(conversions), 2) END AS value
          FROM marts.fct_ad_spend
          WHERE tenant_id = $1 AND date_key BETWEEN $2 AND $3`,
  },
  blended_ctr: {
    label: "Blended CTR",
    format: "percent",
    sql: `SELECT CASE WHEN coalesce(sum(impressions), 0) = 0 THEN NULL
                      ELSE round(sum(clicks)::numeric / sum(impressions), 4) END AS value
          FROM marts.fct_ad_spend
          WHERE tenant_id = $1 AND date_key BETWEEN $2 AND $3`,
  },
  // Inventory value/units are point-in-time state, not a date-range sum -- "as of the end of
  // the selected period" rather than summed across it (summing would multiply-count the same
  // on-hand stock once per day in the range).
  total_inventory_value: {
    label: "Inventory Value",
    format: "currency",
    sql: `SELECT coalesce(sum(inventory_value), 0) AS value
          FROM marts.fct_inventory_snapshot
          WHERE tenant_id = $1 AND ($2::text IS NOT NULL OR true) AND date_key = (
              SELECT max(date_key) FROM marts.fct_inventory_snapshot
              WHERE tenant_id = $1 AND date_key <= $3
          )`,
  },
  total_units_on_hand: {
    label: "Units on Hand",
    format: "count",
    sql: `SELECT coalesce(sum(quantity_on_hand), 0) AS value
          FROM marts.fct_inventory_snapshot
          WHERE tenant_id = $1 AND ($2::text IS NOT NULL OR true) AND date_key = (
              SELECT max(date_key) FROM marts.fct_inventory_snapshot
              WHERE tenant_id = $1 AND date_key <= $3
          )`,
  },
  low_stock_count: {
    label: "Low Stock Products",
    format: "count",
    sql: `SELECT count(*) AS value
          FROM marts.fct_inventory_snapshot
          WHERE tenant_id = $1 AND ($2::text IS NOT NULL OR true) AND quantity_available < 15 AND date_key = (
              SELECT max(date_key) FROM marts.fct_inventory_snapshot
              WHERE tenant_id = $1 AND date_key <= $3
          )`,
  },
};

export const SERIES_METRICS: Record<string, SeriesOrTableMetricDef> = {
  revenue_trend: {
    label: "Revenue Trend",
    sql: `SELECT date_key, sum(gross_revenue) AS gross_revenue, sum(net_revenue) AS net_revenue
          FROM marts.fct_revenue_daily
          WHERE tenant_id = $1 AND date_key BETWEEN $2 AND $3
          GROUP BY date_key
          ORDER BY date_key`,
  },
  discounts_refunds_trend: {
    label: "Discounts & Refunds Trend",
    sql: `SELECT date_key, sum(discounts) AS discounts, sum(refund_amount) AS refund_amount
          FROM marts.fct_revenue_daily
          WHERE tenant_id = $1 AND date_key BETWEEN $2 AND $3
          GROUP BY date_key
          ORDER BY date_key`,
  },
  ad_spend_trend: {
    label: "Ad Spend Trend",
    sql: `SELECT date_key,
                 coalesce(sum(spend) FILTER (WHERE source_system = 'google_ads'), 0) AS google_ads_spend,
                 coalesce(sum(spend) FILTER (WHERE source_system = 'meta_ads'), 0) AS meta_ads_spend
          FROM marts.fct_ad_spend
          WHERE tenant_id = $1 AND date_key BETWEEN $2 AND $3
          GROUP BY date_key
          ORDER BY date_key`,
  },
};

export const TABLE_METRICS: Record<string, SeriesOrTableMetricDef> = {
  top_products: {
    label: "Top Products by Revenue",
    sql: `SELECT dp.product_name, dp.sku, dp.category,
                 sum(foi.line_revenue) AS revenue, sum(foi.quantity) AS units
          FROM marts.fct_order_items foi
          JOIN marts.fct_orders fo ON fo.order_key = foi.order_key AND fo.tenant_id = foi.tenant_id
          JOIN marts.dim_product dp ON dp.product_key = foi.product_key AND dp.tenant_id = foi.tenant_id
          WHERE foi.tenant_id = $1 AND fo.order_date_key BETWEEN $2 AND $3
          GROUP BY dp.product_name, dp.sku, dp.category
          ORDER BY revenue DESC
          LIMIT 10`,
  },
  campaign_performance: {
    label: "Campaign Performance",
    sql: `SELECT dc.campaign_name, dc.source_system, dc.channel,
                 sum(fas.spend) AS spend, sum(fas.clicks) AS clicks, sum(fas.impressions) AS impressions,
                 sum(fas.conversions) AS conversions,
                 CASE WHEN sum(fas.spend) = 0 THEN NULL
                      ELSE round(sum(fas.conversion_value) / sum(fas.spend), 2) END AS roas,
                 CASE WHEN sum(fas.conversions) = 0 THEN NULL
                      ELSE round(sum(fas.spend) / sum(fas.conversions), 2) END AS cpa
          FROM marts.fct_ad_spend fas
          JOIN marts.dim_campaign dc ON dc.campaign_key = fas.campaign_key AND dc.tenant_id = fas.tenant_id
          WHERE fas.tenant_id = $1 AND fas.date_key BETWEEN $2 AND $3
          GROUP BY dc.campaign_name, dc.source_system, dc.channel
          ORDER BY spend DESC
          LIMIT 10`,
  },
  // Unlike top_products/campaign_performance (genuinely "top 10" rankings), the Inventory
  // dashboard's table has an "All inventory" view that needs the real catalog, not a top-10
  // slice -- 500 is a generous bound for a real SMB catalog rather than the true unbounded
  // count, so a pathologically large catalog still can't blow up the response.
  inventory_by_product: {
    label: "Inventory by Product (lowest stock first)",
    sql: `SELECT dp.product_name, dp.sku, fis.quantity_on_hand, fis.quantity_available, fis.inventory_value
          FROM marts.fct_inventory_snapshot fis
          JOIN marts.dim_product dp ON dp.product_key = fis.product_key AND dp.tenant_id = fis.tenant_id
          WHERE fis.tenant_id = $1 AND ($2::text IS NOT NULL OR true) AND fis.date_key = (
              SELECT max(date_key) FROM marts.fct_inventory_snapshot
              WHERE tenant_id = $1 AND date_key <= $3
          )
          ORDER BY fis.quantity_available ASC
          LIMIT 500`,
  },
};

export const ALL_METRIC_KEYS: string[] = [
  ...Object.keys(SCALAR_METRICS),
  ...Object.keys(SERIES_METRICS),
  ...Object.keys(TABLE_METRICS),
];

// Postgres numeric columns come back from `pg` as JS strings (to avoid float precision loss
// silently, same reason Python's Decimal exists) -- cast explicitly so every metric value is
// always a real JSON number, matching Python's _to_number()'s exact purpose.
function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

// Postgres OIDs for the numeric-family types this registry's queries actually return
// (numeric, int8/int4/int2, float8/float4) -- deliberately NOT a "does this string look like a
// number" heuristic. A product name or SKU that happens to be all-digits (a real, mundane
// possibility) would otherwise get silently mangled into a number -- exactly the class of
// silent-wrong-data bug this whole rewrite is trying to avoid, not reintroduce.
const NUMERIC_TYPE_OIDS = new Set([20, 21, 23, 700, 701, 1700]);

function mapRowNumbers(row: Record<string, unknown>, fields: { name: string; dataTypeID: number }[]): Record<string, unknown> {
  const numericColumns = new Set(fields.filter((f) => NUMERIC_TYPE_OIDS.has(f.dataTypeID)).map((f) => f.name));
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    mapped[key] = numericColumns.has(key) ? toNumber(value) : value;
  }
  return mapped;
}

async function scalarValue(
  client: PgClient,
  metric: ScalarMetricDef,
  tenantId: string,
  startDate: string,
  endDate: string,
): Promise<number | null> {
  const result = await client.query(metric.sql, [tenantId, startDate, endDate]);
  return toNumber(result.rows[0].value);
}

function deltaPct(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  if (previous === 0) return current === 0 ? null : 1.0; // "up from zero" -- treat as +100%
  // Python's round() uses banker's rounding (round-half-to-even); Math.round() rounds
  // half-away-from-zero. These differ only on an EXACT tie at the 4th decimal place, which a
  // real (current-previous)/previous division essentially never lands on -- accepted as a
  // negligible, documented discrepancy rather than hand-rolling banker's rounding for it.
  return Math.round(((current - previous) / previous) * 10000) / 10000;
}

export interface MetricResult {
  metric: string;
  label: string;
  value?: number | null;
  previous_value?: number | null;
  delta_pct?: number | null;
  is_estimated: boolean;
  series?: Record<string, unknown>[];
  rows?: Record<string, unknown>[];
}

export async function computeMetric(
  client: PgClient,
  tenantId: string,
  metricKey: string,
  startDate: string,
  endDate: string,
  compare = false,
): Promise<MetricResult> {
  if (metricKey in SCALAR_METRICS) {
    const metric = SCALAR_METRICS[metricKey];
    const value = await scalarValue(client, metric, tenantId, startDate, endDate);
    const result: MetricResult = {
      metric: metricKey,
      label: metric.label,
      value,
      is_estimated: metric.isEstimated ?? false,
    };
    if (compare) {
      // Prior period of the same length immediately before start_date, e.g. "last 30 days"
      // compares against the 30 days before that -- not calendar-month-over-month.
      const start = new Date(`${startDate}T00:00:00Z`);
      const end = new Date(`${endDate}T00:00:00Z`);
      const periodLengthDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
      const prevEnd = new Date(start.getTime() - 86_400_000);
      const prevStart = new Date(prevEnd.getTime() - (periodLengthDays - 1) * 86_400_000);
      const previousValue = await scalarValue(
        client,
        metric,
        tenantId,
        prevStart.toISOString().slice(0, 10),
        prevEnd.toISOString().slice(0, 10),
      );
      result.previous_value = previousValue;
      result.delta_pct = deltaPct(value, previousValue);
    }
    return result;
  }

  if (metricKey in SERIES_METRICS) {
    const metric = SERIES_METRICS[metricKey];
    const result = await client.query(metric.sql, [tenantId, startDate, endDate]);
    return {
      metric: metricKey,
      label: metric.label,
      series: result.rows.map((row) => mapRowNumbers(row, result.fields)),
      is_estimated: false,
    };
  }

  if (metricKey in TABLE_METRICS) {
    const metric = TABLE_METRICS[metricKey];
    const result = await client.query(metric.sql, [tenantId, startDate, endDate]);
    return {
      metric: metricKey,
      label: metric.label,
      rows: result.rows.map((row) => mapRowNumbers(row, result.fields)),
      is_estimated: false,
    };
  }

  throw new Error(`unknown metric: ${metricKey}`);
}
