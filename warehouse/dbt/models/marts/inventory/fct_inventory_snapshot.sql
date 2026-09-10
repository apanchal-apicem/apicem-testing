-- Grain: one row per product per day (doc Sec 5.2), an SCD-like snapshot fact.
-- Every inventory metric query filters this table on (tenant_id, date_key), including
-- the max(date_key) subquery metric_registry.py uses to find "as of" the selected range.
{{ config(indexes=[{'columns': ['tenant_id', 'date_key']}]) }}
select
    ib.tenant_id,
    ib.snapshot_date                       as date_key,
    dp.product_key,
    ib.quantity_on_hand,
    ib.quantity_committed,
    ib.quantity_available,
    ib.quantity_on_hand * coalesce(dp.unit_cost, 0) as inventory_value
from {{ ref('stg_netsuite__inventory_balances') }} ib
left join {{ ref('dim_product') }} dp
    on dp.tenant_id = ib.tenant_id and dp.sku = ib.sku
where 1=1 {{ tenant_scope_predicate('ib.tenant_id') }}
