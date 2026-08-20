select
    tenant_id,
    source_id                                      as product_id,
    payload ->> 'title'                            as product_name,
    payload ->> 'product_type'                     as category,
    payload ->> 'vendor'                           as brand,
    payload -> 'variants' -> 0 ->> 'sku'           as sku,
    (payload -> 'variants' -> 0 ->> 'price')::numeric as unit_price,
    _loaded_at
from {{ source('raw', 'shopify_products') }}
