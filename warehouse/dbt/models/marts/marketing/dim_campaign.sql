select
    {{ dbt_utils.generate_surrogate_key(['tenant_id', 'source_system', 'source_campaign_id']) }} as campaign_key,
    tenant_id,
    source_system,
    source_campaign_id,
    campaign_name,
    channel,
    objective,
    status
from {{ ref('int_ad_campaigns__unified') }}
where 1=1 {{ tenant_scope_predicate('tenant_id') }}
