select
    tenant_id,
    source_id                                              as campaign_id,
    payload -> 'campaign' ->> 'name'                       as campaign_name,
    payload -> 'campaign' ->> 'status'                     as status,
    payload -> 'campaign' ->> 'advertisingChannelType'     as channel,
    cast(null as text)                                     as objective,
    _loaded_at
from {{ source('google_ads', 'google_ads_campaigns') }}
