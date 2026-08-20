"""Meta (Facebook) Marketing API client: long-lived access token, cursor pagination via
`paging.next`.

NOTE ON TESTABILITY: same caveat as connectors/google_ads/client.py -- structurally correct
against Meta's documented Graph API shape, never run against a live ad account. Meta's real
rate-limit signaling is more nuanced than a plain 429 in some cases; this handles the
common documented cases (429 and 5xx), not every edge case of their rate-limiting headers.
"""
import os
import random
import time

import requests

API_VERSION = os.environ.get("META_ADS_API_VERSION", "v20.0")
MAX_RETRIES = 5
MAX_BACKOFF_SECONDS = 60


class MetaAdsClient:
    def __init__(self, access_token, ad_account_id):
        self.access_token = access_token
        # Accept either "act_123" or "123" -- the API needs the "act_" prefix.
        self.ad_account_id = ad_account_id if ad_account_id.startswith("act_") else f"act_{ad_account_id}"
        self.base_url = f"https://graph.facebook.com/{API_VERSION}"

    def _request(self, url, params=None):
        for attempt in range(MAX_RETRIES):
            response = requests.get(url, params=params, timeout=30)
            if response.status_code == 429:
                time.sleep(min(2 ** attempt, MAX_BACKOFF_SECONDS) + random.uniform(0, 0.5))
                continue
            if response.status_code >= 500:
                time.sleep(min(2 ** attempt, MAX_BACKOFF_SECONDS) + random.uniform(0, 0.5))
                continue
            response.raise_for_status()
            return response.json()
        raise RuntimeError(f"exhausted retries against Meta Ads API: {url}")

    def _paginate(self, path, params):
        params = {**params, "access_token": self.access_token, "limit": 500}
        url = f"{self.base_url}/{path}"
        while url:
            data = self._request(url, params=params)
            for record in data.get("data", []):
                yield record
            next_url = (data.get("paging") or {}).get("next")
            url = next_url
            params = None  # the next URL already encodes everything, including the token

    def get_campaigns(self):
        yield from self._paginate(
            f"{self.ad_account_id}/campaigns",
            {"fields": "id,name,status,objective"},
        )

    def get_insights(self, date_from, date_to):
        """One row per campaign per day in [date_from, date_to], both YYYY-MM-DD."""
        yield from self._paginate(
            f"{self.ad_account_id}/insights",
            {
                "level": "campaign",
                "time_increment": 1,
                "time_range": f'{{"since":"{date_from}","until":"{date_to}"}}',
                "fields": "campaign_id,campaign_name,date_start,impressions,clicks,spend,actions,action_values",
            },
        )
