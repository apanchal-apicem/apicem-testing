"""NetSuite SuiteTalk REST client: OAuth 1.0a Token-Based Authentication (TBA), SuiteQL for
querying, offset pagination.

NOTE ON TESTABILITY: same caveat as the Google/Meta Ads clients -- never run against a real
NetSuite account. The OAuth1/HMAC-SHA256 signing below follows the documented spec exactly
(this part is a well-defined algorithm, not guesswork), but the exact SuiteQL table/column
names for inventory balances vary by which NetSuite features an account has enabled
(Multi-Location Inventory, WMS, etc.) -- treat those specific queries as a starting point to
adjust against the real account's schema, not a guaranteed-correct query.
"""
import base64
import hashlib
import hmac
import os
import random
import secrets
import time
import urllib.parse

import requests

MAX_RETRIES = 5
MAX_BACKOFF_SECONDS = 60
PAGE_LIMIT = 1000


def _percent_encode(value):
    return urllib.parse.quote(str(value), safe="")


class NetSuiteClient:
    def __init__(self, account_id, consumer_key, consumer_secret, token_id, token_secret):
        self.account_id = account_id
        self.consumer_key = consumer_key
        self.consumer_secret = consumer_secret
        self.token_id = token_id
        self.token_secret = token_secret
        # NetSuite's REST domain derives from the account id with underscores as hyphens,
        # lowercased (e.g. "1234567_SB1" -> "1234567-sb1").
        host_account = account_id.replace("_", "-").lower()
        self.base_url = f"https://{host_account}.suitetalk.api.netsuite.com/services/rest"

    def _oauth_header(self, method, url):
        oauth_params = {
            "oauth_consumer_key": self.consumer_key,
            "oauth_token": self.token_id,
            "oauth_signature_method": "HMAC-SHA256",
            "oauth_timestamp": str(int(time.time())),
            "oauth_nonce": secrets.token_hex(16),
            "oauth_version": "1.0",
        }
        base_url, _, query = url.partition("?")
        query_params = dict(urllib.parse.parse_qsl(query)) if query else {}
        all_params = {**oauth_params, **query_params}
        sorted_param_string = "&".join(
            f"{_percent_encode(k)}={_percent_encode(v)}" for k, v in sorted(all_params.items())
        )
        base_string = "&".join([method.upper(), _percent_encode(base_url), _percent_encode(sorted_param_string)])
        signing_key = f"{_percent_encode(self.consumer_secret)}&{_percent_encode(self.token_secret)}"
        signature = base64.b64encode(
            hmac.new(signing_key.encode(), base_string.encode(), hashlib.sha256).digest()
        ).decode()
        oauth_params["oauth_signature"] = signature

        header_params = ", ".join(f'{_percent_encode(k)}="{_percent_encode(v)}"' for k, v in oauth_params.items())
        return f'OAuth realm="{_percent_encode(self.account_id)}", {header_params}'

    def _request(self, method, url, json_body=None):
        for attempt in range(MAX_RETRIES):
            headers = {
                "Authorization": self._oauth_header(method, url),
                "Content-Type": "application/json",
                "Prefer": "transient",
            }
            response = requests.request(method, url, headers=headers, json=json_body, timeout=30)
            if response.status_code == 429:
                time.sleep(min(2 ** attempt, MAX_BACKOFF_SECONDS) + random.uniform(0, 0.5))
                continue
            if response.status_code >= 500:
                time.sleep(min(2 ** attempt, MAX_BACKOFF_SECONDS) + random.uniform(0, 0.5))
                continue
            response.raise_for_status()
            return response.json()
        raise RuntimeError(f"exhausted retries against NetSuite: {url}")

    def _suiteql(self, query):
        offset = 0
        while True:
            url = f"{self.base_url}/query/v1/suiteql?limit={PAGE_LIMIT}&offset={offset}"
            data = self._request("POST", url, json_body={"q": query})
            for item in data.get("items", []):
                yield item
            if not data.get("hasMore"):
                break
            offset += PAGE_LIMIT

    def get_items(self):
        """SKU, display name, and unit cost for the item catalog -- the entity-resolution
        key into dim_product is SKU (doc Sec 5.3)."""
        yield from self._suiteql(
            "SELECT id, itemid AS sku, displayname, cost FROM item WHERE isinactive = 'F'"
        )

    def get_inventory_balances(self):
        """Adjust this query against the real account's inventory feature set -- see the
        module docstring's caveat."""
        yield from self._suiteql(
            """
            SELECT item.itemid AS sku, item.id AS item_id,
                   inventorybalance.quantityonhand, inventorybalance.quantitycommitted,
                   inventorybalance.quantityavailable
            FROM inventorybalance
            JOIN item ON item.id = inventorybalance.item
            """
        )
