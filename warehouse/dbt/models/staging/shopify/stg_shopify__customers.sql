select
    tenant_id,
    source_id                                          as customer_id,
    payload ->> 'email'                                as email,
    lower(payload ->> 'email')                         as email_normalized,
    payload ->> 'first_name'                           as first_name,
    payload ->> 'last_name'                            as last_name,
    (payload ->> 'created_at')::timestamptz            as customer_since,
    coalesce((payload ->> 'orders_count')::int, 0)     as lifetime_orders_reported,
    coalesce((payload ->> 'total_spent')::numeric, 0)  as lifetime_revenue_reported,
    _loaded_at
from {{ source('raw', 'shopify_customers') }}
