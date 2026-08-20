-- Canonical ad-campaign shape (doc Sec 5.4): every ad platform adapts into the same
-- columns here so dim_campaign never needs to know which source a row came from.
select tenant_id, 'google_ads' as source_system, campaign_id as source_campaign_id,
       campaign_name, channel, objective, status
from {{ ref('stg_google_ads__campaigns') }}

union all

select tenant_id, 'meta_ads' as source_system, campaign_id as source_campaign_id,
       campaign_name, channel, objective, status
from {{ ref('stg_meta_ads__campaigns') }}
