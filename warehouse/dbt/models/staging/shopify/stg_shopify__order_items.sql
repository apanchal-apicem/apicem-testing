-- One row per line item, unnested from the order payload's line_items array.
select
    tenant_id,
    source_id                                  as order_id,
    line_item ->> 'id'                          as order_item_id,
    line_item ->> 'product_id'                  as source_product_id,
    line_item ->> 'sku'                         as sku,
    (line_item ->> 'quantity')::int             as quantity,
    (line_item ->> 'price')::numeric            as unit_price,
    (line_item ->> 'price')::numeric * (line_item ->> 'quantity')::int as line_revenue
from {{ source('raw', 'shopify_orders') }},
    jsonb_array_elements(payload -> 'line_items') as line_item
