-- Grain: one row per campaign per day (doc Sec 5.2).
-- Every ad-spend metric query filters this table on (tenant_id, date_key).
{{ config(indexes=[{'columns': ['tenant_id', 'date_key']}]) }}
select
    {{ dbt_utils.generate_surrogate_key(['ai.tenant_id', 'ai.source_system', 'ai.source_campaign_id', 'ai.date_key']) }} as spend_key,
    ai.tenant_id,
    dc.campaign_key,
    ai.date_key,
    ai.impressions,
    ai.clicks,
    ai.spend,
    ai.conversions,
    ai.conversion_value,
    ai.source_system
from {{ ref('int_ad_insights__unified') }} ai
left join {{ ref('dim_campaign') }} dc
    on dc.tenant_id = ai.tenant_id
    and dc.source_system = ai.source_system
    and dc.source_campaign_id = ai.source_campaign_id
where 1=1 {{ tenant_scope_predicate('ai.tenant_id') }}
