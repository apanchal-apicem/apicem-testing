-- Raw/landing tables for the three new connectors (doc Sec 1.1.2, 2.5, 3.1), same
-- schema-on-read + natural-key-upsert pattern as raw.shopify_* (Sec 003).

CREATE TABLE raw.google_ads_campaigns (
    tenant_id     uuid NOT NULL,
    source_id     text NOT NULL,
    payload       jsonb NOT NULL,
    source_updated_at timestamptz,
    _loaded_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, source_id)
);

-- Grain: one row per campaign per day.
CREATE TABLE raw.google_ads_insights (
    tenant_id     uuid NOT NULL,
    source_id     text NOT NULL,
    payload       jsonb NOT NULL,
    source_updated_at timestamptz,
    _loaded_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, source_id)
);

CREATE TABLE raw.meta_ads_campaigns (
    tenant_id     uuid NOT NULL,
    source_id     text NOT NULL,
    payload       jsonb NOT NULL,
    source_updated_at timestamptz,
    _loaded_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, source_id)
);

-- Grain: one row per campaign per day.
CREATE TABLE raw.meta_ads_insights (
    tenant_id     uuid NOT NULL,
    source_id     text NOT NULL,
    payload       jsonb NOT NULL,
    source_updated_at timestamptz,
    _loaded_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, source_id)
);

-- NetSuite item catalog -- the entity-resolution join key into dim_product is SKU (doc Sec
-- 5.3: "matching a Shopify SKU to a NetSuite item"), carried inside payload.
CREATE TABLE raw.netsuite_items (
    tenant_id     uuid NOT NULL,
    source_id     text NOT NULL,
    payload       jsonb NOT NULL,
    source_updated_at timestamptz,
    _loaded_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, source_id)
);

-- Grain: one row per item per day (a daily inventory snapshot, doc Sec 5.2).
CREATE TABLE raw.netsuite_inventory_balances (
    tenant_id     uuid NOT NULL,
    source_id     text NOT NULL,
    payload       jsonb NOT NULL,
    source_updated_at timestamptz,
    _loaded_at    timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (tenant_id, source_id)
);

CREATE INDEX idx_raw_google_ads_campaigns_tenant ON raw.google_ads_campaigns(tenant_id);
CREATE INDEX idx_raw_google_ads_insights_tenant ON raw.google_ads_insights(tenant_id);
CREATE INDEX idx_raw_meta_ads_campaigns_tenant ON raw.meta_ads_campaigns(tenant_id);
CREATE INDEX idx_raw_meta_ads_insights_tenant ON raw.meta_ads_insights(tenant_id);
CREATE INDEX idx_raw_netsuite_items_tenant ON raw.netsuite_items(tenant_id);
CREATE INDEX idx_raw_netsuite_inventory_balances_tenant ON raw.netsuite_inventory_balances(tenant_id);
