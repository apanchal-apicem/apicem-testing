"""Dashboards defined once as metric+chart configs, not hand-built per client (doc Sec 8.2).
Conditional rendering by connected source: a dashboard only appears once the tenant has an
active connection providing every capability it needs.
"""

SOURCE_CAPABILITIES = {
    "shopify": {"ecommerce"},
    "google_ads": {"advertising"},
    "meta_ads": {"advertising"},
    "netsuite": {"erp", "inventory"},
}

DASHBOARDS = [
    {
        "id": "executive_overview",
        "title": "Executive Overview",
        "required_capabilities": {"ecommerce"},
        "widgets": [
            {"type": "kpi", "metric": "gross_revenue", "label": "Gross Revenue"},
            {"type": "kpi", "metric": "net_revenue", "label": "Net Revenue"},
            {"type": "kpi", "metric": "order_count", "label": "Orders"},
            {"type": "kpi", "metric": "new_customer_count", "label": "New Customers"},
            {"type": "kpi", "metric": "gross_margin_pct", "label": "Gross Margin %"},
            {"type": "trend", "metric": "revenue_trend", "label": "Revenue Trend"},
            # Reuses the same metric Product Performance already computes -- an executive
            # summary naming top products is a standard second section, not new computation.
            {"type": "table", "metric": "top_products", "label": "Top Products by Revenue"},
        ],
    },
    {
        "id": "revenue",
        "title": "Revenue",
        "required_capabilities": {"ecommerce"},
        "widgets": [
            {"type": "kpi", "metric": "gross_revenue", "label": "Gross Revenue"},
            {"type": "kpi", "metric": "net_revenue", "label": "Net Revenue"},
            {"type": "kpi", "metric": "aov", "label": "Average Order Value"},
            {"type": "kpi", "metric": "total_discounts", "label": "Total Discounts"},
            {"type": "kpi", "metric": "total_refunds", "label": "Total Refunds"},
            {"type": "trend", "metric": "revenue_trend", "label": "Revenue Trend"},
            {"type": "trend", "metric": "discounts_refunds_trend", "label": "Discounts & Refunds Trend"},
        ],
    },
    {
        "id": "product_performance",
        "title": "Product Performance",
        "required_capabilities": {"ecommerce"},
        "widgets": [
            {"type": "table", "metric": "top_products", "label": "Top Products by Revenue"},
        ],
    },
    {
        "id": "marketing_performance",
        "title": "Marketing Performance",
        "required_capabilities": {"advertising"},
        "widgets": [
            {"type": "kpi", "metric": "total_ad_spend", "label": "Total Ad Spend"},
            {"type": "kpi", "metric": "total_conversions", "label": "Conversions"},
            {"type": "kpi", "metric": "blended_roas", "label": "Blended ROAS"},
            {"type": "trend", "metric": "ad_spend_trend", "label": "Ad Spend Trend"},
            # Same table Advertising ROI shows -- a marketing summary naming which
            # campaigns are actually driving that spend is the natural second section.
            {"type": "table", "metric": "campaign_performance", "label": "Campaign Performance"},
        ],
    },
    {
        "id": "advertising_roi",
        "title": "Advertising ROI",
        "required_capabilities": {"advertising"},
        "widgets": [
            {"type": "kpi", "metric": "blended_roas", "label": "Blended ROAS"},
            {"type": "kpi", "metric": "blended_cpa", "label": "Blended CPA"},
            {"type": "kpi", "metric": "blended_ctr", "label": "Blended CTR"},
            {"type": "table", "metric": "campaign_performance", "label": "Campaign Performance"},
        ],
    },
    {
        "id": "inventory",
        "title": "Inventory",
        "required_capabilities": {"inventory"},
        "widgets": [
            {"type": "kpi", "metric": "total_inventory_value", "label": "Inventory Value"},
            {"type": "kpi", "metric": "total_units_on_hand", "label": "Units on Hand"},
            {"type": "kpi", "metric": "low_stock_count", "label": "Low Stock Products"},
            {"type": "table", "metric": "inventory_by_product", "label": "Inventory by Product"},
        ],
    },
]


def available_capabilities(connection_source_types):
    capabilities = set()
    for source_type in connection_source_types:
        capabilities |= SOURCE_CAPABILITIES.get(source_type, set())
    return capabilities


def dashboards_for_capabilities(capabilities):
    return [d for d in DASHBOARDS if d["required_capabilities"] <= capabilities]


def get_dashboard(dashboard_id):
    return next((d for d in DASHBOARDS if d["id"] == dashboard_id), None)
