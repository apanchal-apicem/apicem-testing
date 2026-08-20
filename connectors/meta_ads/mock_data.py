"""Synthetic Meta-Ads-shaped data (Graph API insights response shape) -- same role as
connectors/shopify/mock_data.py.
"""
from datetime import datetime, timedelta, timezone

CAMPAIGN_CATALOG = [
    {"name": "Conversions - Lookalike 1%", "objective": "OUTCOME_SALES"},
    {"name": "Retargeting - Cart Abandoners", "objective": "OUTCOME_SALES"},
    {"name": "Awareness - Video Views", "objective": "OUTCOME_AWARENESS"},
]


def generate_mock_campaigns(seed_base=3000):
    return [
        {"id": str(seed_base + i), "name": item["name"], "status": "ACTIVE", "objective": item["objective"]}
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
            impressions = rng.randint(800, 12000)
            clicks = max(1, int(impressions * rng.uniform(0.01, 0.05)))
            spend = round(clicks * rng.uniform(0.4, 2.8), 2)
            purchases = max(0, round(clicks * rng.uniform(0.01, 0.08), 2))
            purchase_value = round(purchases * rng.uniform(30, 100), 2)
            rows.append({
                "campaign_id": campaign["id"],
                "campaign_name": campaign["name"],
                "date_start": day,
                "impressions": str(impressions),
                "clicks": str(clicks),
                "spend": str(spend),
                "actions": [{"action_type": "purchase", "value": str(purchases)}],
                "action_values": [{"action_type": "purchase", "value": str(purchase_value)}],
            })
    return rows
