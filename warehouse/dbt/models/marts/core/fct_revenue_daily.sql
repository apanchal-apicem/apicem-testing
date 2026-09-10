-- Grain: one row per tenant per day per channel. Rolled-up mart the dashboards query
-- directly so reads stay sub-second against pre-aggregated data (doc Sec 1.3, 5.2).
-- Every metric_registry.py query against this table filters on exactly (tenant_id,
-- date_key) -- a composite index matching that predicate, not two separate single-column
-- ones (doc's own "index the predicate you actually run" rule).
{{ config(indexes=[{'columns': ['tenant_id', 'date_key']}]) }}
with first_order as (
    select tenant_id, customer_key, min(order_date_key) as first_order_date
    from {{ ref('fct_orders') }}
    where 1=1 {{ tenant_scope_predicate('tenant_id') }}
    group by tenant_id, customer_key
)
select
    fo.tenant_id,
    fo.order_date_key                                              as date_key,
    'ecommerce'                                                    as channel,
    sum(fo.gross_revenue)                                          as gross_revenue,
    sum(fo.net_revenue)                                            as net_revenue,
    sum(fo.discounts)                                              as discounts,
    sum(fo.refund_amount)                                          as refund_amount,
    count(*)                                                       as order_count,
    count(*) filter (where fo.order_date_key = fst.first_order_date) as new_customer_count
from {{ ref('fct_orders') }} fo
left join first_order fst
    on fst.tenant_id = fo.tenant_id and fst.customer_key = fo.customer_key
where 1=1 {{ tenant_scope_predicate('fo.tenant_id') }}
group by fo.tenant_id, fo.order_date_key
