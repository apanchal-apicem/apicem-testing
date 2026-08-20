-- unit_cost comes from NetSuite, entity-resolved by SKU (doc Sec 5.3) -- null until a
-- NetSuite connection exists and has a matching SKU, exactly the "populated once an ERP
-- source is connected" case doc Sec 5.4 describes for columns a single source can't supply.
select
    {{ dbt_utils.generate_surrogate_key(['sp.tenant_id', 'sp.product_id']) }} as product_key,
    sp.tenant_id,
    'shopify'                  as source_system,
    sp.product_id              as source_product_id,
    sp.sku,
    sp.product_name,
    sp.category,
    cast(null as text)         as sub_category,
    sp.brand,
    ni.unit_cost,
    sp.unit_price,
    true                       as is_current,
    sp._loaded_at              as valid_from,
    cast(null as timestamptz)  as valid_to
from {{ ref('stg_shopify__products') }} sp
left join {{ ref('stg_netsuite__items') }} ni
    on ni.tenant_id = sp.tenant_id and ni.sku = sp.sku
where 1=1 {{ tenant_scope_predicate('sp.tenant_id') }}
