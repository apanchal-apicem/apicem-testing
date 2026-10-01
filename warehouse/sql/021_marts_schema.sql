-- 021_marts_schema.sql
-- Marts tables required by metric_registry.py and analytics query engine.

CREATE SCHEMA IF NOT EXISTS marts;

CREATE TABLE IF NOT EXISTS marts.fct_revenue_daily (
    tenant_id          uuid NOT NULL,
    date_key           date NOT NULL,
    channel            text NOT NULL DEFAULT 'ecommerce',
    gross_revenue      numeric NOT NULL DEFAULT 0,
    net_revenue        numeric NOT NULL DEFAULT 0,
    discounts          numeric NOT NULL DEFAULT 0,
    refund_amount      numeric NOT NULL DEFAULT 0,
    order_count        integer NOT NULL DEFAULT 0,
    new_customer_count integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS marts.fct_orders (
    tenant_id          uuid NOT NULL,
    order_key          text NOT NULL,
    customer_key       text,
    order_date_key     date NOT NULL,
    gross_revenue      numeric NOT NULL DEFAULT 0,
    net_revenue        numeric NOT NULL DEFAULT 0,
    discounts          numeric NOT NULL DEFAULT 0,
    refund_amount      numeric NOT NULL DEFAULT 0,
    cost_of_goods      numeric,
    gross_margin       numeric
);

CREATE TABLE IF NOT EXISTS marts.fct_order_items (
    tenant_id          uuid NOT NULL,
    order_key          text NOT NULL,
    product_key        text NOT NULL,
    line_revenue       numeric NOT NULL DEFAULT 0,
    quantity           integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS marts.dim_product (
    tenant_id          uuid NOT NULL,
    product_key        text NOT NULL,
    product_name       text NOT NULL,
    sku                text,
    category           text
);

CREATE TABLE IF NOT EXISTS marts.fct_ad_spend (
    tenant_id          uuid NOT NULL,
    date_key           date NOT NULL,
    source_system      text NOT NULL,
    campaign_key       text,
    spend              numeric NOT NULL DEFAULT 0,
    clicks             integer NOT NULL DEFAULT 0,
    impressions        integer NOT NULL DEFAULT 0,
    conversions        integer NOT NULL DEFAULT 0,
    conversion_value   numeric NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS marts.dim_campaign (
    tenant_id          uuid NOT NULL,
    campaign_key       text NOT NULL,
    campaign_name      text NOT NULL,
    source_system      text,
    channel            text
);

CREATE TABLE IF NOT EXISTS marts.fct_inventory_snapshot (
    tenant_id          uuid NOT NULL,
    date_key           date NOT NULL,
    product_key        text,
    inventory_value    numeric NOT NULL DEFAULT 0,
    quantity_on_hand   integer NOT NULL DEFAULT 0,
    quantity_available integer NOT NULL DEFAULT 0
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_fct_rev_daily ON marts.fct_revenue_daily(tenant_id, date_key);
CREATE INDEX IF NOT EXISTS idx_fct_orders_tenant ON marts.fct_orders(tenant_id, order_date_key);
CREATE INDEX IF NOT EXISTS idx_fct_ad_spend_tenant ON marts.fct_ad_spend(tenant_id, date_key);
CREATE INDEX IF NOT EXISTS idx_fct_inv_tenant ON marts.fct_inventory_snapshot(tenant_id, date_key);

-- RLS
ALTER TABLE marts.fct_revenue_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON marts.fct_revenue_daily
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE marts.fct_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON marts.fct_orders
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE marts.fct_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON marts.fct_order_items
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE marts.dim_product ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON marts.dim_product
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE marts.fct_ad_spend ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON marts.fct_ad_spend
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE marts.dim_campaign ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON marts.dim_campaign
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

ALTER TABLE marts.fct_inventory_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON marts.fct_inventory_snapshot
    USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);

-- Grants
GRANT USAGE ON SCHEMA marts TO apicem_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA marts TO apicem_app;
