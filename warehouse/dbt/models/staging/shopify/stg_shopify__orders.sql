-- 1:1 with raw.shopify_orders. Light typing/renaming only, no business logic (doc Sec 3.3).
select
    tenant_id,
    source_id                                                          as order_id,
    (payload ->> 'created_at')::timestamptz                            as order_created_at,
    (payload ->> 'updated_at')::timestamptz                            as order_updated_at,
    (payload ->> 'cancelled_at')::timestamptz                          as cancelled_at,
    payload ->> 'financial_status'                                    as financial_status,
    payload ->> 'fulfillment_status'                                  as fulfillment_status,
    payload ->> 'currency'                                            as currency,
    payload -> 'customer' ->> 'id'                                    as source_customer_id,
    -- Shopify's subtotal_price is already net of discounts (line items after discount,
    -- before shipping/tax) -- gross revenue means the pre-discount top line, so the
    -- discount has to be added back rather than just relabeling subtotal_price as gross.
    -- fct_orders.sql's net_revenue = gross_revenue - discounts then correctly nets back
    -- down to subtotal_price, not to subtotal_price double-counted.
    (payload ->> 'subtotal_price')::numeric
        + coalesce((payload ->> 'total_discounts')::numeric, 0)       as gross_revenue,
    coalesce((payload ->> 'total_discounts')::numeric, 0)              as discounts,
    -- refunds[] is an array of refund events, each with its own transactions[] (the actual
    -- dollar movements) -- mirrors real Shopify's nesting, not a simplification unique to
    -- mock data. Only successful refund-kind transactions count; a failed/pending one
    -- shouldn't reduce revenue.
    coalesce((
        select sum((txn ->> 'amount')::numeric)
        from jsonb_array_elements(coalesce(payload -> 'refunds', '[]'::jsonb)) as refund
        cross join jsonb_array_elements(coalesce(refund -> 'transactions', '[]'::jsonb)) as txn
        where txn ->> 'kind' = 'refund' and txn ->> 'status' = 'success'
    ), 0)                                                               as refund_amount,
    coalesce((payload -> 'total_shipping_price_set' -> 'shop_money' ->> 'amount')::numeric, 0) as shipping,
    coalesce((payload ->> 'total_tax')::numeric, 0)                    as taxes,
    (payload ->> 'total_price')::numeric                               as total_price,
    _loaded_at
from {{ source('raw', 'shopify_orders') }}
