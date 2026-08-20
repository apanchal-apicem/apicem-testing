"""Google Ads API client: OAuth2 refresh-token auth, GAQL search, page-token pagination.

NOTE ON TESTABILITY: unlike the Shopify client (verified against a real store earlier in
this project), this has never been exercised against a live Google Ads account -- there's
no developer-token/OAuth app set up for this project. The request shapes match Google's
documented REST interface, but treat this as "structurally correct, not field-verified"
until it's run against a real account.
"""
import os
import random
import time

import requests

API_VERSION = os.environ.get("GOOGLE_ADS_API_VERSION", "v17")
PAGE_SIZE = 1000
MAX_RETRIES = 5
MAX_BACKOFF_SECONDS = 60


class GoogleAdsClient:
    def __init__(self, client_id, client_secret, refresh_token, developer_token, customer_id, login_customer_id=None):
        self.client_id = client_id
        self.client_secret = client_secret
        self.refresh_token = refresh_token
        self.developer_token = developer_token
        self.customer_id = customer_id.replace("-", "")
        self.login_customer_id = (login_customer_id or "").replace("-", "") or None
        self._access_token = None
        self._access_token_expires_at = 0

    def _get_access_token(self):
        if self._access_token and time.time() < self._access_token_expires_at - 60:
            return self._access_token
        response = requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "refresh_token": self.refresh_token,
                "grant_type": "refresh_token",
            },
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()
        self._access_token = data["access_token"]
        self._access_token_expires_at = time.time() + data.get("expires_in", 3600)
        return self._access_token

    def _request(self, body):
        headers = {
            "Authorization": f"Bearer {self._get_access_token()}",
            "developer-token": self.developer_token,
            "Content-Type": "application/json",
        }
        if self.login_customer_id:
            headers["login-customer-id"] = self.login_customer_id
        url = f"https://googleads.googleapis.com/{API_VERSION}/customers/{self.customer_id}/googleAds:search"

        for attempt in range(MAX_RETRIES):
            response = requests.post(url, headers=headers, json=body, timeout=30)
            if response.status_code == 429:
                retry_after = float(response.headers.get("Retry-After", 2 ** attempt))
                time.sleep(min(retry_after, MAX_BACKOFF_SECONDS) + random.uniform(0, 0.5))
                continue
            if response.status_code >= 500:
                time.sleep(min(2 ** attempt, MAX_BACKOFF_SECONDS) + random.uniform(0, 0.5))
                continue
            response.raise_for_status()
            return response.json()
        raise RuntimeError(f"exhausted retries against Google Ads API for customer {self.customer_id}")

    def _search(self, query):
        page_token = None
        while True:
            body = {"query": query, "pageSize": PAGE_SIZE}
            if page_token:
                body["pageToken"] = page_token
            data = self._request(body)
            for row in data.get("results", []):
                yield row
            page_token = data.get("nextPageToken")
            if not page_token:
                break

    def get_campaigns(self):
        query = """
            SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type
            FROM campaign
        """
        yield from self._search(query)

    def get_insights(self, date_from, date_to):
        """One row per campaign per day in [date_from, date_to], both YYYY-MM-DD."""
        query = f"""
            SELECT campaign.id, campaign.name, segments.date, metrics.impressions, metrics.clicks,
                   metrics.cost_micros, metrics.conversions, metrics.conversions_value
            FROM campaign
            WHERE segments.date BETWEEN '{date_from}' AND '{date_to}'
        """
        yield from self._search(query)
