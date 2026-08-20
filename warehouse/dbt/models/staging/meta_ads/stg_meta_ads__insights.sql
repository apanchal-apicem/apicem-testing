-- Grain: one row per campaign per day. actions/action_values are arrays of {action_type,
-- value} -- pull out the "purchase" entry specifically for conversions/conversion_value,
-- matching how the Executive Overview treats "conversion" for Google Ads too.
select
    tenant_id,
    source_id                                          as insight_id,
    payload ->> 'campaign_id'                          as campaign_id,
    (payload ->> 'date_start')::date                   as date_key,
    coalesce((payload ->> 'impressions')::bigint, 0)   as impressions,
    coalesce((payload ->> 'clicks')::bigint, 0)        as clicks,
    coalesce((payload ->> 'spend')::numeric, 0)        as spend,
    coalesce((
        select (action ->> 'value')::numeric
        from jsonb_array_elements(payload -> 'actions') as action
        where action ->> 'action_type' = 'purchase'
        limit 1
    ), 0) as conversions,
    coalesce((
        select (action_value ->> 'value')::numeric
        from jsonb_array_elements(payload -> 'action_values') as action_value
        where action_value ->> 'action_type' = 'purchase'
        limit 1
    ), 0) as conversion_value,
    _loaded_at
from {{ source('meta_ads', 'meta_ads_insights') }}
