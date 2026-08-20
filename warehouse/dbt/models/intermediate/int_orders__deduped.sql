-- Guards against upstream pagination bugs occasionally returning the same order twice
-- (doc Sec 7.1). Keeps the most recently loaded copy per natural key.
select distinct on (tenant_id, order_id) *
from {{ ref('stg_shopify__orders') }}
order by tenant_id, order_id, _loaded_at desc
