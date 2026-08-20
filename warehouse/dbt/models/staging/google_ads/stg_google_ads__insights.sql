-- Grain: one row per campaign per day. cost is Google's "micros" (millionths of the
-- account's currency unit) -- divide by 1,000,000 to get a real spend amount.
select
    tenant_id,
    source_id                                                          as insight_id,
    payload -> 'campaign' ->> 'id'                                     as campaign_id,
    (payload -> 'segments' ->> 'date')::date                          as date_key,
    coalesce((payload -> 'metrics' ->> 'impressions')::bigint, 0)      as impressions,
    coalesce((payload -> 'metrics' ->> 'clicks')::bigint, 0)           as clicks,
    coalesce((payload -> 'metrics' ->> 'costMicros')::numeric, 0) / 1000000.0 as spend,
    coalesce((payload -> 'metrics' ->> 'conversions')::numeric, 0)     as conversions,
    coalesce((payload -> 'metrics' ->> 'conversionsValue')::numeric, 0) as conversion_value,
    _loaded_at
from {{ source('google_ads', 'google_ads_insights') }}
