-- Per-order COGS, aggregated from line items -- lives in the intermediate layer (not
-- computed inline in fct_orders) specifically to avoid a circular dependency: fct_orders
-- would otherwise need fct_order_items for cost, while fct_order_items needs fct_orders'
-- order_key. Both fct_orders and fct_order_items instead read cost independently from here
-- and from dim_product directly.
select
    oi.tenant_id,
    oi.order_id,
    sum(oi.quantity * dp.unit_cost)        as cost_of_goods,
    bool_and(dp.unit_cost is not null)     as all_items_have_cost
from {{ ref('stg_shopify__order_items') }} oi
left join {{ ref('dim_product') }} dp
    on dp.tenant_id = oi.tenant_id and dp.source_product_id = oi.source_product_id
group by oi.tenant_id, oi.order_id
