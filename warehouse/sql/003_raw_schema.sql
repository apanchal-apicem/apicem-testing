-- Raw/landing tables (architecture doc Sec 1.1.2, 2.5, 3.1).
-- Schema-on-read: payload is JSONB so source field drift never breaks ingestion.
-- Upsert key is (tenant_id, source_id) so a re-run of a partial sync never duplicates rows (Sec 3.4).

CREATE TABLE raw.shopify_orders (
    tenant_id     uuid NOT NULL,
    source_id     text NOT NULL,
    payload       jsonb NOT NULL,
    source_updated_at timestamptz,
    _loaded_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, source_id)
);

CREATE TABLE raw.shopify_customers (
    tenant_id     uuid NOT NULL,
    source_id     text NOT NULL,
    payload       jsonb NOT NULL,
    source_updated_at timestamptz,
    _loaded_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, source_id)
);

CREATE TABLE raw.shopify_products (
    tenant_id     uuid NOT NULL,
    source_id     text NOT NULL,
    payload       jsonb NOT NULL,
    source_updated_at timestamptz,
    _loaded_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, source_id)
);

CREATE INDEX idx_raw_shopify_orders_tenant ON raw.shopify_orders(tenant_id);
CREATE INDEX idx_raw_shopify_customers_tenant ON raw.shopify_customers(tenant_id);
CREATE INDEX idx_raw_shopify_products_tenant ON raw.shopify_products(tenant_id);
