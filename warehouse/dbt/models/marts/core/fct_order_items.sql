-- Grain: one row per SKU per order, needed for product analytics (doc Sec 5.2).
select
    {{ dbt_utils.generate_surrogate_key(['oi.tenant_id', 'oi.order_item_id']) }} as order_item_key,
    oi.tenant_id,
    fo.order_key,
    dp.product_key,
    oi.quantity,
    oi.unit_price,
    oi.line_revenue,
    oi.quantity * dp.unit_cost as line_cost
from {{ ref('stg_shopify__order_items') }} oi
join {{ ref('fct_orders') }} fo
    on fo.tenant_id = oi.tenant_id and fo.order_id = oi.order_id
left join {{ ref('dim_product') }} dp
    on dp.tenant_id = oi.tenant_id and dp.source_product_id = oi.source_product_id
where 1=1 {{ tenant_scope_predicate('oi.tenant_id') }}
