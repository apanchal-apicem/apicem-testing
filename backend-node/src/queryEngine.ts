import type { PgClient } from "./db.js";
import { SCALAR_METRICS } from "./metricRegistry.js";

export interface QueryFilter {
  column: string;
  operator?: string;
  value: string;
}

export interface AdHocQueryInput {
  metricIds?: string[];
  dimensions?: string[];
  filters?: QueryFilter[];
  startDate?: string;
  endDate?: string;
}

export interface QueryColumn {
  key: string;
  label: string;
  type: "string" | "number" | "currency" | "percent" | "ratio" | "date";
}

export interface AdHocQueryResult {
  columns: QueryColumn[];
  rows: Record<string, string | number>[];
  chartSuggestion: "line" | "bar" | "kpi" | "table";
  confidence: number;
  sql: string;
  summary: string;
  resolvedKey?: string;
}

function mapFormatToColumnType(format: string | undefined): QueryColumn["type"] {
  if (format === "currency" || format === "percent" || format === "ratio") return format;
  return "number";
}

const DIMENSION_CONFIG: Record<string, { label: string; type: "string" | "date" }> = {
  date: { label: "Date", type: "date" },
  day: { label: "Day", type: "date" },
  week: { label: "Week", type: "date" },
  month: { label: "Month", type: "date" },
  channel: { label: "Channel", type: "string" },
  category: { label: "Category", type: "string" },
  product: { label: "Product", type: "string" },
  campaign: { label: "Campaign", type: "string" },
  source_system: { label: "Source", type: "string" },
};

const AD_METRICS = new Set(["total_ad_spend", "total_conversions", "blended_roas", "blended_cpa", "blended_ctr"]);

export async function executeAdHocQuery(
  client: PgClient,
  tenantId: string,
  input: AdHocQueryInput,
): Promise<AdHocQueryResult> {
  const metricIds = (input.metricIds && input.metricIds.length > 0) ? input.metricIds : ["gross_revenue"];
  const dimensions = (input.dimensions ?? []).map((d) => d.toLowerCase());
  const filters = input.filters ?? [];
  const singleMetric = metricIds.length === 1;

  const hasProductDim = dimensions.includes("product") || dimensions.includes("category");
  const isAdQuery = metricIds.some((m) => AD_METRICS.has(m)) || dimensions.includes("campaign");

  const queryParams: (string | number)[] = [tenantId];
  let nextParamIndex = 2;

  let sql = "";
  const columns: QueryColumn[] = [];

  // Determine chart suggestion
  let chartSuggestion: "line" | "bar" | "kpi" | "table" = "line";
  if (dimensions.length === 0) {
    chartSuggestion = "kpi";
  } else if (dimensions.length > 1) {
    chartSuggestion = "table";
  } else if (dimensions.includes("date") || dimensions.includes("day") || dimensions.includes("week") || dimensions.includes("month")) {
    chartSuggestion = "line";
  } else {
    chartSuggestion = "bar";
  }

  if (isAdQuery) {
    // -------------------------------------------------------------
    // Querying marts.fct_ad_spend joined with dim_campaign
    // -------------------------------------------------------------
    const selectDimParts: string[] = [];
    const groupByParts: string[] = [];

    if (dimensions.length === 0) {
      selectDimParts.push("fas.date_key::text AS date");
      groupByParts.push("fas.date_key");
      columns.push({ key: "date", label: "Date", type: "date" });
    } else {
      for (const dim of dimensions) {
        if (dim === "campaign") {
          selectDimParts.push("dc.campaign_name AS campaign");
          groupByParts.push("dc.campaign_name");
          columns.push({ key: "campaign", label: "Campaign", type: "string" });
        } else if (dim === "channel") {
          selectDimParts.push("dc.channel");
          groupByParts.push("dc.channel");
          columns.push({ key: "channel", label: "Channel", type: "string" });
        } else if (dim === "source_system" || dim === "source") {
          selectDimParts.push("fas.source_system AS source");
          groupByParts.push("fas.source_system");
          columns.push({ key: "source", label: "Source", type: "string" });
        } else if (dim === "date" || dim === "day") {
          selectDimParts.push("fas.date_key::text AS date");
          groupByParts.push("fas.date_key");
          columns.push({ key: "date", label: "Date", type: "date" });
        } else if (dim === "week") {
          selectDimParts.push("date_trunc('week', fas.date_key)::date::text AS week");
          groupByParts.push("date_trunc('week', fas.date_key)::date");
          columns.push({ key: "week", label: "Week", type: "date" });
        }
      }
    }

    const selectMetricParts: string[] = [];
    for (const m of metricIds) {
      const colKey = singleMetric ? "value" : m;
      const meta = SCALAR_METRICS[m];
      const label = meta?.label ?? m;

      switch (m) {
        case "total_ad_spend":
          selectMetricParts.push(`round(sum(fas.spend), 2)::float AS ${colKey}`);
          break;
        case "total_conversions":
          selectMetricParts.push(`sum(fas.conversions)::int AS ${colKey}`);
          break;
        case "blended_roas":
          selectMetricParts.push(
            `CASE WHEN sum(fas.spend) = 0 THEN 0 ELSE round((sum(fas.conversion_value) / sum(fas.spend))::numeric, 2)::float END AS ${colKey}`,
          );
          break;
        case "blended_cpa":
          selectMetricParts.push(
            `CASE WHEN sum(fas.conversions) = 0 THEN 0 ELSE round((sum(fas.spend) / sum(fas.conversions))::numeric, 2)::float END AS ${colKey}`,
          );
          break;
        case "blended_ctr":
          selectMetricParts.push(
            `CASE WHEN sum(fas.impressions) = 0 THEN 0 ELSE round(((sum(fas.clicks)::numeric / sum(fas.impressions)))::numeric, 4)::float END AS ${colKey}`,
          );
          break;
        default:
          selectMetricParts.push(`round(sum(fas.spend), 2)::float AS ${colKey}`);
          break;
      }
      columns.push({ key: colKey, label, type: mapFormatToColumnType(meta?.format) });
    }

    let whereClause = "WHERE fas.tenant_id = $1";

    if (input.startDate) {
      whereClause += ` AND fas.date_key >= $${nextParamIndex++}`;
      queryParams.push(input.startDate);
    }
    if (input.endDate) {
      whereClause += ` AND fas.date_key <= $${nextParamIndex++}`;
      queryParams.push(input.endDate);
    }

    for (const f of filters) {
      const fCol = f.column.toLowerCase();
      if (fCol === "campaign") {
        whereClause += ` AND dc.campaign_name ILIKE $${nextParamIndex++}`;
        queryParams.push(`%${f.value}%`);
      } else if (fCol === "source" || fCol === "source_system") {
        whereClause += ` AND fas.source_system ILIKE $${nextParamIndex++}`;
        queryParams.push(`%${f.value}%`);
      }
    }

    const orderCol = singleMetric ? "value" : metricIds[0];
    const orderExpr = (dimensions.includes("date") || dimensions.length === 0) ? "1 ASC" : `${orderCol} DESC`;

    sql = `
      SELECT ${[...selectDimParts, ...selectMetricParts].join(", ")}
      FROM marts.fct_ad_spend fas
      JOIN marts.dim_campaign dc ON dc.campaign_key = fas.campaign_key AND dc.tenant_id = fas.tenant_id
      ${whereClause}
      GROUP BY ${groupByParts.join(", ")}
      ORDER BY ${orderExpr}
      LIMIT 100
    `;
  } else if (hasProductDim) {
    // -------------------------------------------------------------
    // Querying marts.fct_order_items joined with dim_product
    // -------------------------------------------------------------
    const selectDimParts: string[] = [];
    const groupByParts: string[] = [];

    for (const dim of dimensions) {
      if (dim === "product") {
        selectDimParts.push("dp.product_name AS product");
        groupByParts.push("dp.product_name");
        columns.push({ key: "product", label: "Product", type: "string" });
      } else if (dim === "category") {
        selectDimParts.push("coalesce(dp.category, 'Uncategorized') AS category");
        groupByParts.push("dp.category");
        columns.push({ key: "category", label: "Category", type: "string" });
      } else if (dim === "date" || dim === "day") {
        selectDimParts.push("fo.order_date_key::text AS date");
        groupByParts.push("fo.order_date_key");
        columns.push({ key: "date", label: "Date", type: "date" });
      }
    }

    const selectMetricParts: string[] = [];
    for (const m of metricIds) {
      const colKey = singleMetric ? "value" : m;
      const meta = SCALAR_METRICS[m];
      const label = meta?.label ?? m;

      if (m === "order_count" || m === "units") {
        selectMetricParts.push(`sum(foi.quantity)::int AS ${colKey}`);
        columns.push({ key: colKey, label, type: "number" });
      } else {
        selectMetricParts.push(`round(sum(foi.line_revenue), 2)::float AS ${colKey}`);
        columns.push({ key: colKey, label, type: mapFormatToColumnType(meta?.format) });
      }
    }

    let whereClause = "WHERE foi.tenant_id = $1";

    if (input.startDate) {
      whereClause += ` AND fo.order_date_key >= $${nextParamIndex++}`;
      queryParams.push(input.startDate);
    }
    if (input.endDate) {
      whereClause += ` AND fo.order_date_key <= $${nextParamIndex++}`;
      queryParams.push(input.endDate);
    }

    for (const f of filters) {
      const fCol = f.column.toLowerCase();
      if (fCol === "category") {
        whereClause += ` AND dp.category ILIKE $${nextParamIndex++}`;
        queryParams.push(`%${f.value}%`);
      } else if (fCol === "product") {
        whereClause += ` AND dp.product_name ILIKE $${nextParamIndex++}`;
        queryParams.push(`%${f.value}%`);
      }
    }

    const orderCol = singleMetric ? "value" : metricIds[0];
    sql = `
      SELECT ${[...selectDimParts, ...selectMetricParts].join(", ")}
      FROM marts.fct_order_items foi
      JOIN marts.dim_product dp ON dp.product_key = foi.product_key AND dp.tenant_id = foi.tenant_id
      LEFT JOIN marts.fct_orders fo ON fo.order_key = foi.order_key AND fo.tenant_id = foi.tenant_id
      ${whereClause}
      GROUP BY ${groupByParts.join(", ")}
      ORDER BY ${orderCol} DESC
      LIMIT 100
    `;
  } else {
    // -------------------------------------------------------------
    // Querying marts.fct_revenue_daily
    // -------------------------------------------------------------
    const selectDimParts: string[] = [];
    const groupByParts: string[] = [];

    if (dimensions.length === 0) {
      selectDimParts.push("date_key::text AS date");
      groupByParts.push("date_key");
      columns.push({ key: "date", label: "Date", type: "date" });
    } else {
      for (const dim of dimensions) {
        if (dim === "channel") {
          selectDimParts.push("channel");
          groupByParts.push("channel");
          columns.push({ key: "channel", label: "Channel", type: "string" });
        } else if (dim === "date" || dim === "day") {
          selectDimParts.push("date_key::text AS date");
          groupByParts.push("date_key");
          columns.push({ key: "date", label: "Date", type: "date" });
        } else if (dim === "week") {
          selectDimParts.push("date_trunc('week', date_key)::date::text AS week");
          groupByParts.push("date_trunc('week', date_key)::date");
          columns.push({ key: "week", label: "Week", type: "date" });
        } else if (dim === "month") {
          selectDimParts.push("date_trunc('month', date_key)::date::text AS month");
          groupByParts.push("date_trunc('month', date_key)::date");
          columns.push({ key: "month", label: "Month", type: "date" });
        }
      }
    }

    const selectMetricParts: string[] = [];
    for (const m of metricIds) {
      const colKey = singleMetric ? "value" : m;
      const meta = SCALAR_METRICS[m];
      const label = meta?.label ?? m;

      switch (m) {
        case "gross_revenue":
          selectMetricParts.push(`round(sum(gross_revenue), 2)::float AS ${colKey}`);
          break;
        case "net_revenue":
          selectMetricParts.push(`round(sum(net_revenue), 2)::float AS ${colKey}`);
          break;
        case "order_count":
          selectMetricParts.push(`sum(order_count)::int AS ${colKey}`);
          break;
        case "total_discounts":
          selectMetricParts.push(`round(sum(discounts), 2)::float AS ${colKey}`);
          break;
        case "total_refunds":
          selectMetricParts.push(`round(sum(refund_amount), 2)::float AS ${colKey}`);
          break;
        case "new_customer_count":
          selectMetricParts.push(`sum(new_customer_count)::int AS ${colKey}`);
          break;
        case "aov":
          selectMetricParts.push(
            `CASE WHEN sum(order_count) = 0 THEN 0 ELSE round((sum(net_revenue) / sum(order_count))::numeric, 2)::float END AS ${colKey}`,
          );
          break;
        case "repeat_customer_rate":
          selectMetricParts.push(
            `CASE WHEN sum(order_count) = 0 THEN 0 ELSE round(((sum(order_count) - sum(new_customer_count))::numeric / sum(order_count))::numeric, 4)::float END AS ${colKey}`,
          );
          break;
        case "refund_rate_pct":
          selectMetricParts.push(
            `CASE WHEN sum(gross_revenue) = 0 THEN 0 ELSE round((sum(refund_amount) / sum(gross_revenue))::numeric, 4)::float END AS ${colKey}`,
          );
          break;
        default:
          selectMetricParts.push(`round(sum(gross_revenue), 2)::float AS ${colKey}`);
          break;
      }
      columns.push({ key: colKey, label, type: mapFormatToColumnType(meta?.format) });
    }

    let whereClause = "WHERE tenant_id = $1";

    if (input.startDate) {
      whereClause += ` AND date_key >= $${nextParamIndex++}`;
      queryParams.push(input.startDate);
    }
    if (input.endDate) {
      whereClause += ` AND date_key <= $${nextParamIndex++}`;
      queryParams.push(input.endDate);
    }

    for (const f of filters) {
      const fCol = f.column.toLowerCase();
      if (fCol === "channel") {
        whereClause += ` AND channel ILIKE $${nextParamIndex++}`;
        queryParams.push(`%${f.value}%`);
      } else if (fCol === "date") {
        whereClause += ` AND date_key = $${nextParamIndex++}`;
        queryParams.push(f.value);
      }
    }

    const orderExpr = (dimensions.includes("date") || dimensions.length === 0) ? "1 ASC" : "2 DESC";
    sql = `
      SELECT ${[...selectDimParts, ...selectMetricParts].join(", ")}
      FROM marts.fct_revenue_daily
      ${whereClause}
      GROUP BY ${groupByParts.join(", ")}
      ORDER BY ${orderExpr}
      LIMIT 100
    `;
  }

  const queryResult = await client.query(sql, queryParams);
  const rows = queryResult.rows.map((row) => {
    const formattedRow: Record<string, string | number> = {};
    for (const col of columns) {
      const val = row[col.key];
      if (val === null || val === undefined) {
        formattedRow[col.key] = col.type === "number" || col.type === "currency" || col.type === "percent" || col.type === "ratio" ? 0 : "";
      } else if (typeof val === "number") {
        formattedRow[col.key] = val;
      } else if (typeof val === "string") {
        const num = Number(val);
        formattedRow[col.key] = (col.type !== "string" && col.type !== "date" && !Number.isNaN(num)) ? num : val;
      } else {
        formattedRow[col.key] = String(val);
      }
    }
    return formattedRow;
  });

  const metricNames = metricIds.map((id) => SCALAR_METRICS[id]?.label ?? id).join(", ");
  const dimNames = dimensions.map((d) => DIMENSION_CONFIG[d]?.label ?? d).join(", ");
  const summary = dimensions.length > 0
    ? `${metricNames} broken down by ${dimNames}.`
    : `${metricNames} over time.`;

  return {
    columns,
    rows,
    chartSuggestion,
    confidence: 0.98,
    sql: sql.trim().replace(/\s+/g, " "),
    summary,
    resolvedKey: singleMetric ? metricIds[0] : undefined,
  };
}
