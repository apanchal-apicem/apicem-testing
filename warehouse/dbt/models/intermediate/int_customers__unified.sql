-- Single source (Shopify) today, so no cross-system matching is needed yet. Named and
-- shaped to match the canonical customer concept so a second source (e.g. NetSuite) can
-- be unioned in here later using the deterministic-email-match strategy from doc Sec 5.3,
-- without changing anything downstream in marts.
select
    tenant_id,
    customer_id as source_customer_id,
    'shopify'   as source_system,
    email_normalized,
    first_name,
    last_name,
    customer_since,
    lifetime_orders_reported,
    lifetime_revenue_reported
from {{ ref('stg_shopify__customers') }}
