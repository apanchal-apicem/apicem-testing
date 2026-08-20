-- Grain: one row per order (doc Sec 3.5, 5.2). cost_of_goods/gross_margin come from
-- int_order_costs, which is null (all_items_have_cost = false) until a NetSuite connection
-- with matching SKUs exists -- Shopify alone has no COGS accounting. The dashboard layer
-- must show these as "estimated/unavailable" rather than silently as zero when that's the
-- case (doc Sec 5.4, 7.3).
select
    {{ dbt_utils.generate_surrogate_key(['o.tenant_id', 'o.order_id']) }} as order_key,
    o.tenant_id,
    o.order_id,
    c.customer_key,
    cast(o.order_created_at as date) as order_date_key,
    'shopify'                        as source_system,
    coalesce(o.financial_status, 'unknown') as order_status,
    o.currency,
    o.gross_revenue,
    o.discounts,
    o.refund_amount,
    o.shipping,
    o.taxes,
    -- Net revenue means what the merchant actually keeps -- a refund reduces that just as
    -- much as a discount does, so both come out here (doc Sec 9 update, 2026-08-20).
    (o.gross_revenue - o.discounts - o.refund_amount)  as net_revenue,
    case when ic.all_items_have_cost then ic.cost_of_goods else null end as cost_of_goods,
    case when ic.all_items_have_cost then (o.gross_revenue - o.discounts - o.refund_amount) - ic.cost_of_goods else null end as gross_margin,
    now()                            as _loaded_at
from {{ ref('int_orders__deduped') }} o
left join {{ ref('dim_customer') }} c
    on c.tenant_id = o.tenant_id and c.source_customer_id = o.source_customer_id
left join {{ ref('int_order_costs') }} ic
    on ic.tenant_id = o.tenant_id and ic.order_id = o.order_id
where o.cancelled_at is null {{ tenant_scope_predicate('o.tenant_id') }}
