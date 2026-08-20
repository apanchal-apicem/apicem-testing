-- Grain: one row per item per day (connectors/netsuite/sync.py stamps snapshot_date at
-- extraction time -- NetSuite's own API returns only a current balance, no date).
select
    tenant_id,
    source_id                                              as balance_id,
    payload ->> 'sku'                                      as sku,
    payload ->> 'item_id'                                  as item_id,
    (payload ->> 'snapshot_date')::date                    as snapshot_date,
    coalesce((payload ->> 'quantityonhand')::int, 0)       as quantity_on_hand,
    coalesce((payload ->> 'quantitycommitted')::int, 0)    as quantity_committed,
    coalesce((payload ->> 'quantityavailable')::int, 0)    as quantity_available,
    _loaded_at
from {{ source('netsuite', 'netsuite_inventory_balances') }}
