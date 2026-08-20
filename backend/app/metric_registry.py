"""In-house metric registry standing in for dbt MetricFlow/Cube.dev (doc Sec 8.2, 9): every
metric is defined exactly once here, and every dashboard widget and ad-hoc query goes through
`compute_metric` so no two call sites can silently compute "revenue" differently.

RLS on marts.* already restricts every query to the caller's tenant (Sec 6.2), but tenant_id
is filtered explicitly here too, matching the doc's defense-in-depth requirement (Sec 6.2,
11) that application code must never rely on RLS as the only safeguard.
"""
from datetime import timedelta
from decimal import Decimal

from sqlalchemy import text


def _to_number(value):
    # Postgres numeric columns come back as Decimal; Pydantic/FastAPI serialize Decimal as
    # a JSON string (to avoid float precision loss), which silently breaks the frontend's
    # Number.prototype.toLocaleString formatting (String.prototype.toLocaleString is a
    # near no-op). Cast explicitly so every metric value is always a real JSON number.
    if isinstance(value, Decimal):
        return float(value)
    return value

SCALAR_METRICS = {
    "gross_revenue": {
        "label": "Gross Revenue",
        "format": "currency",
        "sql": """
            SELECT coalesce(sum(gross_revenue), 0) AS value
            FROM marts.fct_revenue_daily
            WHERE tenant_id = :tenant_id AND date_key BETWEEN :start_date AND :end_date
        """,
    },
    "net_revenue": {
        "label": "Net Revenue",
        "format": "currency",
        "sql": """
            SELECT coalesce(sum(net_revenue), 0) AS value
            FROM marts.fct_revenue_daily
            WHERE tenant_id = :tenant_id AND date_key BETWEEN :start_date AND :end_date
        """,
    },
    "order_count": {
        "label": "Orders",
        "format": "count",
        "sql": """
            SELECT coalesce(sum(order_count), 0) AS value
            FROM marts.fct_revenue_daily
            WHERE tenant_id = :tenant_id AND date_key BETWEEN :start_date AND :end_date
        """,
    },
    "total_discounts": {
        "label": "Total Discounts",
        "format": "currency",
        "sql": """
            SELECT coalesce(sum(discounts), 0) AS value
            FROM marts.fct_revenue_daily
            WHERE tenant_id = :tenant_id AND date_key BETWEEN :start_date AND :end_date
        """,
    },
    "total_refunds": {
        "label": "Total Refunds",
        "format": "currency",
        "sql": """
            SELECT coalesce(sum(refund_amount), 0) AS value
            FROM marts.fct_revenue_daily
            WHERE tenant_id = :tenant_id AND date_key BETWEEN :start_date AND :end_date
        """,
    },
    "new_customer_count": {
        "label": "New Customers",
        "format": "count",
        "sql": """
            SELECT coalesce(sum(new_customer_count), 0) AS value
            FROM marts.fct_revenue_daily
            WHERE tenant_id = :tenant_id AND date_key BETWEEN :start_date AND :end_date
        """,
    },
    "aov": {
        "label": "Average Order Value",
        "format": "currency",
        "sql": """
            SELECT CASE WHEN coalesce(sum(order_count), 0) = 0 THEN 0
                        ELSE round(sum(net_revenue) / sum(order_count), 2) END AS value
            FROM marts.fct_revenue_daily
            WHERE tenant_id = :tenant_id AND date_key BETWEEN :start_date AND :end_date
        """,
    },
    "gross_margin_pct": {
        "label": "Gross Margin %",
        "format": "percent",
        # cost_of_goods is only ever populated once an ERP source is connected (doc Sec
        # 5.4) -- Shopify alone can't provide it, so this always reports as estimated/
        # unavailable in the Shopify-only MVP rather than silently showing 0%.
        "is_estimated": True,
        "sql": """
            SELECT CASE WHEN sum(gross_revenue) = 0 OR sum(cost_of_goods) IS NULL THEN NULL
                        ELSE round(sum(gross_margin) / sum(gross_revenue), 4) END AS value
            FROM marts.fct_orders
            WHERE tenant_id = :tenant_id AND order_date_key BETWEEN :start_date AND :end_date
        """,
    },
    "total_ad_spend": {
        "label": "Total Ad Spend",
        "format": "currency",
        "sql": """
            SELECT coalesce(sum(spend), 0) AS value
            FROM marts.fct_ad_spend
            WHERE tenant_id = :tenant_id AND date_key BETWEEN :start_date AND :end_date
        """,
    },
    "total_conversions": {
        "label": "Conversions",
        "format": "count",
        "sql": """
            SELECT coalesce(sum(conversions), 0) AS value
            FROM marts.fct_ad_spend
            WHERE tenant_id = :tenant_id AND date_key BETWEEN :start_date AND :end_date
        """,
    },
    "blended_roas": {
        "label": "Blended ROAS",
        "format": "ratio",
        "sql": """
            SELECT CASE WHEN coalesce(sum(spend), 0) = 0 THEN NULL
                        ELSE round(sum(conversion_value) / sum(spend), 2) END AS value
            FROM marts.fct_ad_spend
            WHERE tenant_id = :tenant_id AND date_key BETWEEN :start_date AND :end_date
        """,
    },
    "blended_cpa": {
        "label": "Blended CPA",
        "format": "currency",
        "sql": """
            SELECT CASE WHEN coalesce(sum(conversions), 0) = 0 THEN NULL
                        ELSE round(sum(spend) / sum(conversions), 2) END AS value
            FROM marts.fct_ad_spend
            WHERE tenant_id = :tenant_id AND date_key BETWEEN :start_date AND :end_date
        """,
    },
    "blended_ctr": {
        "label": "Blended CTR",
        "format": "percent",
        "sql": """
            SELECT CASE WHEN coalesce(sum(impressions), 0) = 0 THEN NULL
                        ELSE round(sum(clicks)::numeric / sum(impressions), 4) END AS value
            FROM marts.fct_ad_spend
            WHERE tenant_id = :tenant_id AND date_key BETWEEN :start_date AND :end_date
        """,
    },
    # Inventory value/units are point-in-time state, not a date-range sum -- "as of the end
    # of the selected period" rather than summed across it (summing would multiply-count
    # the same on-hand stock once per day in the range).
    "total_inventory_value": {
        "label": "Inventory Value",
        "format": "currency",
        "sql": """
            SELECT coalesce(sum(inventory_value), 0) AS value
            FROM marts.fct_inventory_snapshot
            WHERE tenant_id = :tenant_id AND date_key = (
                SELECT max(date_key) FROM marts.fct_inventory_snapshot
                WHERE tenant_id = :tenant_id AND date_key <= :end_date
            )
        """,
    },
    "total_units_on_hand": {
        "label": "Units on Hand",
        "format": "count",
        "sql": """
            SELECT coalesce(sum(quantity_on_hand), 0) AS value
            FROM marts.fct_inventory_snapshot
            WHERE tenant_id = :tenant_id AND date_key = (
                SELECT max(date_key) FROM marts.fct_inventory_snapshot
                WHERE tenant_id = :tenant_id AND date_key <= :end_date
            )
        """,
    },
    "low_stock_count": {
        "label": "Low Stock Products",
        "format": "count",
        "sql": """
            SELECT count(*) AS value
            FROM marts.fct_inventory_snapshot
            WHERE tenant_id = :tenant_id AND quantity_available < 15 AND date_key = (
                SELECT max(date_key) FROM marts.fct_inventory_snapshot
                WHERE tenant_id = :tenant_id AND date_key <= :end_date
            )
        """,
    },
}

SERIES_METRICS = {
    "revenue_trend": {
        "label": "Revenue Trend",
        "sql": """
            SELECT date_key, sum(gross_revenue) AS gross_revenue, sum(net_revenue) AS net_revenue
            FROM marts.fct_revenue_daily
            WHERE tenant_id = :tenant_id AND date_key BETWEEN :start_date AND :end_date
            GROUP BY date_key
            ORDER BY date_key
        """,
    },
    "discounts_refunds_trend": {
        "label": "Discounts & Refunds Trend",
        "sql": """
            SELECT date_key, sum(discounts) AS discounts, sum(refund_amount) AS refund_amount
            FROM marts.fct_revenue_daily
            WHERE tenant_id = :tenant_id AND date_key BETWEEN :start_date AND :end_date
            GROUP BY date_key
            ORDER BY date_key
        """,
    },
    "ad_spend_trend": {
        "label": "Ad Spend Trend",
        "sql": """
            SELECT date_key,
                   coalesce(sum(spend) FILTER (WHERE source_system = 'google_ads'), 0) AS google_ads_spend,
                   coalesce(sum(spend) FILTER (WHERE source_system = 'meta_ads'), 0) AS meta_ads_spend
            FROM marts.fct_ad_spend
            WHERE tenant_id = :tenant_id AND date_key BETWEEN :start_date AND :end_date
            GROUP BY date_key
            ORDER BY date_key
        """,
    },
}

TABLE_METRICS = {
    "top_products": {
        "label": "Top Products by Revenue",
        "sql": """
            SELECT dp.product_name, dp.sku, dp.category,
                   sum(foi.line_revenue) AS revenue, sum(foi.quantity) AS units
            FROM marts.fct_order_items foi
            JOIN marts.fct_orders fo ON fo.order_key = foi.order_key AND fo.tenant_id = foi.tenant_id
            JOIN marts.dim_product dp ON dp.product_key = foi.product_key AND dp.tenant_id = foi.tenant_id
            WHERE foi.tenant_id = :tenant_id AND fo.order_date_key BETWEEN :start_date AND :end_date
            GROUP BY dp.product_name, dp.sku, dp.category
            ORDER BY revenue DESC
            LIMIT 10
        """,
    },
    "campaign_performance": {
        "label": "Campaign Performance",
        "sql": """
            SELECT dc.campaign_name, dc.source_system, dc.channel,
                   sum(fas.spend) AS spend, sum(fas.clicks) AS clicks, sum(fas.impressions) AS impressions,
                   sum(fas.conversions) AS conversions,
                   CASE WHEN sum(fas.spend) = 0 THEN NULL
                        ELSE round(sum(fas.conversion_value) / sum(fas.spend), 2) END AS roas,
                   CASE WHEN sum(fas.conversions) = 0 THEN NULL
                        ELSE round(sum(fas.spend) / sum(fas.conversions), 2) END AS cpa
            FROM marts.fct_ad_spend fas
            JOIN marts.dim_campaign dc ON dc.campaign_key = fas.campaign_key AND dc.tenant_id = fas.tenant_id
            WHERE fas.tenant_id = :tenant_id AND fas.date_key BETWEEN :start_date AND :end_date
            GROUP BY dc.campaign_name, dc.source_system, dc.channel
            ORDER BY spend DESC
            LIMIT 10
        """,
    },
    "inventory_by_product": {
        "label": "Inventory by Product (lowest stock first)",
        "sql": """
            SELECT dp.product_name, dp.sku, fis.quantity_on_hand, fis.quantity_available, fis.inventory_value
            FROM marts.fct_inventory_snapshot fis
            JOIN marts.dim_product dp ON dp.product_key = fis.product_key AND dp.tenant_id = fis.tenant_id
            WHERE fis.tenant_id = :tenant_id AND fis.date_key = (
                SELECT max(date_key) FROM marts.fct_inventory_snapshot
                WHERE tenant_id = :tenant_id AND date_key <= :end_date
            )
            ORDER BY fis.quantity_available ASC
            LIMIT 10
        """,
    },
}


def _scalar_value(db, metric, tenant_id, start_date, end_date):
    row = db.execute(
        text(metric["sql"]),
        {"tenant_id": str(tenant_id), "start_date": start_date, "end_date": end_date},
    ).one()
    return _to_number(row.value)


def _delta_pct(current, previous):
    if current is None or previous is None:
        return None
    if previous == 0:
        return None if current == 0 else 1.0  # "up from zero" has no finite % -- treat as +100%
    return round((current - previous) / previous, 4)


def compute_metric(db, tenant_id, metric_key, start_date, end_date, compare=False):
    if metric_key in SCALAR_METRICS:
        metric = SCALAR_METRICS[metric_key]
        value = _scalar_value(db, metric, tenant_id, start_date, end_date)
        result = {
            "metric": metric_key,
            "label": metric["label"],
            "value": value,
            "is_estimated": metric.get("is_estimated", False),
        }
        if compare:
            # Prior period of the same length immediately before start_date, e.g. "last 30
            # days" compares against the 30 days before that -- not calendar-month-over-month.
            period_length = (end_date - start_date).days + 1
            prev_end = start_date - timedelta(days=1)
            prev_start = prev_end - timedelta(days=period_length - 1)
            previous_value = _scalar_value(db, metric, tenant_id, prev_start, prev_end)
            result["previous_value"] = previous_value
            result["delta_pct"] = _delta_pct(value, previous_value)
        return result

    if metric_key in SERIES_METRICS:
        metric = SERIES_METRICS[metric_key]
        rows = db.execute(
            text(metric["sql"]),
            {"tenant_id": str(tenant_id), "start_date": start_date, "end_date": end_date},
        ).all()
        return {
            "metric": metric_key,
            "label": metric["label"],
            "series": [{k: _to_number(v) for k, v in row._mapping.items()} for row in rows],
            "is_estimated": False,
        }

    if metric_key in TABLE_METRICS:
        metric = TABLE_METRICS[metric_key]
        rows = db.execute(
            text(metric["sql"]),
            {"tenant_id": str(tenant_id), "start_date": start_date, "end_date": end_date},
        ).all()
        return {
            "metric": metric_key,
            "label": metric["label"],
            "rows": [{k: _to_number(v) for k, v in row._mapping.items()} for row in rows],
            "is_estimated": False,
        }

    raise KeyError(f"unknown metric: {metric_key}")
