"""Synthetic Google-Ads-shaped data (GAQL search-response row shape) so Marketing
Performance / Advertising ROI dashboards are demoable with zero external setup -- same
role as connectors/shopify/mock_data.py.
"""
from datetime import datetime, timedelta, timezone

CAMPAIGN_CATALOG = [
    {"name": "Brand - Search", "channel": "SEARCH"},
    {"name": "Prospecting - Performance Max", "channel": "PERFORMANCE_MAX"},
    {"name": "Retargeting - Display", "channel": "DISPLAY"},
    {"name": "Shopping - Core Catalog", "channel": "SHOPPING"},
]


def generate_mock_campaigns(seed_base=2000):
    return [
        {
            "campaign": {
                "id": str(seed_base + i),
                "name": item["name"],
                "status": "ENABLED",
                "advertisingChannelType": item["channel"],
            }
        }
        for i, item in enumerate(CAMPAIGN_CATALOG)
    ]


def generate_mock_insights(campaigns, since_days=90, rng=None):
    import random as random_module

    rng = rng or random_module
    now = datetime.now(timezone.utc)
    rows = []
    for day_offset in range(since_days):
        day = (now - timedelta(days=day_offset)).strftime("%Y-%m-%d")
        for campaign in campaigns:
            campaign_id = campaign["campaign"]["id"]
            impressions = rng.randint(500, 8000)
            clicks = max(1, int(impressions * rng.uniform(0.01, 0.06)))
            cost_micros = int(clicks * rng.uniform(0.6, 3.5) * 1_000_000)
            conversions = round(clicks * rng.uniform(0.02, 0.12), 2)
            conversion_value = round(conversions * rng.uniform(25, 120), 2)
            rows.append({
                "campaign": {"id": campaign_id, "name": campaign["campaign"]["name"]},
                "segments": {"date": day},
                "metrics": {
                    "impressions": impressions,
                    "clicks": clicks,
                    "costMicros": cost_micros,
                    "conversions": conversions,
                    "conversionsValue": conversion_value,
                },
            })
    return rows
