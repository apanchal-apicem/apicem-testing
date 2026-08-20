-- Type-1 dimension for MVP (is_current/valid_from/valid_to columns are kept so the model
-- matches the canonical schema in doc Sec 5.2; upgrading to true SCD2 later means adding a
-- dbt snapshot on int_customers__unified, not changing this table's shape).
select
    {{ dbt_utils.generate_surrogate_key(['tenant_id', 'source_system', 'source_customer_id']) }} as customer_key,
    tenant_id,
    source_system,
    source_customer_id,
    md5(email_normalized)      as email_hash,
    first_name,
    last_name,
    customer_since,
    lifetime_orders_reported   as lifetime_orders,
    lifetime_revenue_reported  as lifetime_revenue,
    cast(null as text)         as segment,
    true                       as is_current,
    customer_since             as valid_from,
    cast(null as timestamptz)  as valid_to
from {{ ref('int_customers__unified') }}
where 1=1 {{ tenant_scope_predicate('tenant_id') }}
