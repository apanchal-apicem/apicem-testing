-- SKU is the entity-resolution key into dim_product (doc Sec 5.3: "matching a Shopify SKU
-- to a NetSuite item").
select
    tenant_id,
    source_id                      as item_id,
    payload ->> 'sku'              as sku,
    payload ->> 'displayname'      as display_name,
    (payload ->> 'cost')::numeric  as unit_cost,
    _loaded_at
from {{ source('netsuite', 'netsuite_items') }}
