select tenant_id, 'google_ads' as source_system, campaign_id as source_campaign_id,
       date_key, impressions, clicks, spend, conversions, conversion_value
from {{ ref('stg_google_ads__insights') }}

union all

select tenant_id, 'meta_ads' as source_system, campaign_id as source_campaign_id,
       date_key, impressions, clicks, spend, conversions, conversion_value
from {{ ref('stg_meta_ads__insights') }}
