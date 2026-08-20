"""Shopify Admin REST API client: cursor pagination, incremental filters, rate-limit backoff.

Implements the connector-layer requirements from architecture doc Sec 2.3/2.4: exponential
backoff with jitter on 429/5xx honoring Retry-After, cursor-based pagination via the Link
header (stable under concurrent writes, unlike page-number pagination), and incremental sync
via Shopify's native `updated_at_min` filter.
"""
import os
import random
import re
import time

import requests

# Shopify retires each quarterly API version roughly 12 months after release (with ~9
# months of overlap before the old one goes 404) -- see
# https://shopify.dev/docs/api/usage/versioning. A hardcoded version WILL eventually start
# 404ing on every request with no other symptom, so this is configurable: bump
# SHOPIFY_API_VERSION (format YYYY-MM, e.g. "2026-07") without a code change once the
# current default ages out.
API_VERSION = os.environ.get("SHOPIFY_API_VERSION", "2026-04")
PAGE_LIMIT = 100
MAX_RETRIES = 5
# A single wait must never exceed this, no matter what Shopify's Retry-After says -- an
# unbounded honor-anything-the-server-says wait turned one real sync into an hours-long
# silent hang with zero visible progress.
MAX_BACKOFF_SECONDS = 60


class ShopifyRateLimitError(Exception):
    pass


class ShopifyClient:
    def __init__(self, shop_domain, access_token):
        self.base_url = f"https://{shop_domain}/admin/api/{API_VERSION}"
        self.session = requests.Session()
        self.session.headers.update({"X-Shopify-Access-Token": access_token})

    def _request(self, url, params=None):
        for attempt in range(MAX_RETRIES):
            response = self.session.get(url, params=params, timeout=30)
            if response.status_code == 429:
                retry_after = float(response.headers.get("Retry-After", 2 ** attempt))
                time.sleep(min(retry_after, MAX_BACKOFF_SECONDS) + random.uniform(0, 0.5))
                continue
            if response.status_code >= 500:
                time.sleep(min(2 ** attempt, MAX_BACKOFF_SECONDS) + random.uniform(0, 0.5))
                continue
            response.raise_for_status()
            return response
        raise ShopifyRateLimitError(f"exhausted retries against {url}")

    def _paginate(self, resource, params):
        url = f"{self.base_url}/{resource}.json"
        while url:
            response = self._request(url, params=params)
            payload = response.json()
            for record in payload.get(resource, []):
                yield record

            next_url = None
            for part in response.headers.get("Link", "").split(","):
                match = re.search(r'<([^>]+)>;\s*rel="next"', part)
                if match:
                    next_url = match.group(1)
            url = next_url
            params = None  # cursor is already encoded into next_url

    def get_orders(self, updated_at_min=None, created_at_min=None):
        # status=any: the default orders.json filter only returns open orders, which would
        # silently drop fulfilled/cancelled history from the pipeline.
        params = {"limit": PAGE_LIMIT, "status": "any"}
        if updated_at_min:
            params["updated_at_min"] = updated_at_min
        # created_at_min bounds the FIRST (cursorless) sync -- doc Sec 3.5 explicitly calls
        # for bounding and communicating initial-backfill depth rather than fetching a real
        # store's entire history before landing a single row.
        if created_at_min:
            params["created_at_min"] = created_at_min
        yield from self._paginate("orders", params)

    def get_customers(self, updated_at_min=None, created_at_min=None):
        params = {"limit": PAGE_LIMIT}
        if updated_at_min:
            params["updated_at_min"] = updated_at_min
        if created_at_min:
            params["created_at_min"] = created_at_min
        yield from self._paginate("customers", params)

    def get_products(self, updated_at_min=None):
        params = {"limit": PAGE_LIMIT}
        if updated_at_min:
            params["updated_at_min"] = updated_at_min
        yield from self._paginate("products", params)
