-- Meta campaigns have no direct "channel" subdivision the way Google Ads does (search vs
-- display vs shopping) -- 'social' is a fixed literal here; `objective` (OUTCOME_SALES etc.)
-- carries the platform-specific detail instead.
select
    tenant_id,
    source_id               as campaign_id,
    payload ->> 'name'      as campaign_name,
    payload ->> 'status'    as status,
    'social'                as channel,
    payload ->> 'objective' as objective,
    _loaded_at
from {{ source('meta_ads', 'meta_ads_campaigns') }}
