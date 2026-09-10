"""Pure logic, no DB -- connectors/*/mock_data.py generators have zero external dependencies
(stdlib only), so these run against the backend's own pytest/venv rather than standing up a
separate connectors test environment. Loaded by file path (not `import mock_data`) because
every connector has its own module named `mock_data`/`client` -- a plain sys.path-based import
would have the second connector's `mock_data` shadow the first's.

Two things these guard against, both silent-wrong-number bugs of the same shape as the
2026-08-31 date-range and ad-spend incidents:
  1. Mock data must be deterministic per rng seed (connectors/shopify/mock_data.py's
     docstring: a re-sync of the same mock connection must regenerate the SAME rows by id,
     or raw.* grows unboundedly instead of upserting in place).
  2. The financial fields on a mock Shopify order must actually satisfy the revenue
     semantics the rest of the app assumes (subtotal_price is net of discount; gross
     revenue is reconstructed elsewhere as subtotal_price + total_discounts). If a future
     edit to the generator breaks this invariant, marts.fct_revenue_daily would be silently
     wrong for every mock tenant without any error anywhere.
"""
import importlib.util
import os
import random

import pytest

_CONNECTORS_ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "connectors")


def _load_module(connector: str, filename: str):
    path = os.path.join(_CONNECTORS_ROOT, connector, filename)
    spec = importlib.util.spec_from_file_location(f"{connector}_{filename}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


shopify_mock = _load_module("shopify", "mock_data.py")
google_ads_mock = _load_module("google_ads", "mock_data.py")
meta_ads_mock = _load_module("meta_ads", "mock_data.py")
netsuite_mock = _load_module("netsuite", "mock_data.py")


class TestShopifyMockData:
    def test_same_seed_regenerates_identical_orders(self):
        products = shopify_mock.generate_mock_products()
        customers = shopify_mock.generate_mock_customers(10, rng=random.Random("conn-a"))
        first = shopify_mock.generate_mock_orders(customers, products, 20, rng=random.Random("conn-a"))
        second = shopify_mock.generate_mock_orders(customers, products, 20, rng=random.Random("conn-a"))
        assert [o["id"] for o in first] == [o["id"] for o in second]
        assert [o["total_price"] for o in first] == [o["total_price"] for o in second]

    def test_different_seeds_produce_different_orders(self):
        products = shopify_mock.generate_mock_products()
        customers = shopify_mock.generate_mock_customers(10, rng=random.Random("conn-a"))
        a = shopify_mock.generate_mock_orders(customers, products, 20, rng=random.Random("conn-a"))
        b = shopify_mock.generate_mock_orders(customers, products, 20, rng=random.Random("conn-b"))
        assert [o["id"] for o in a] != [o["id"] for o in b]

    def test_subtotal_price_is_net_of_discount_not_gross(self):
        # The exact invariant from feedback_shopify_revenue_semantics: subtotal_price is
        # ALREADY net of discounts, so gross must be reconstructed as subtotal_price +
        # total_discounts, never used as-is for a gross figure.
        products = shopify_mock.generate_mock_products()
        customers = shopify_mock.generate_mock_customers(10, rng=random.Random("net-check"))
        orders = shopify_mock.generate_mock_orders(customers, products, 50, rng=random.Random("net-check"))
        for order in orders:
            line_item_gross = sum(
                float(li["price"]) * li["quantity"] for li in order["line_items"]
            )
            reconstructed_gross = float(order["subtotal_price"]) + float(order["total_discounts"])
            assert reconstructed_gross == pytest.approx(line_item_gross, abs=0.01)

    def test_total_price_reconciles_from_its_own_components(self):
        products = shopify_mock.generate_mock_products()
        customers = shopify_mock.generate_mock_customers(10, rng=random.Random("total-check"))
        orders = shopify_mock.generate_mock_orders(customers, products, 50, rng=random.Random("total-check"))
        for order in orders:
            shipping = float(order["total_shipping_price_set"]["shop_money"]["amount"])
            expected_total = float(order["subtotal_price"]) + shipping + float(order["total_tax"])
            assert float(order["total_price"]) == pytest.approx(expected_total, abs=0.01)

    def test_cancelled_orders_have_no_fulfillment_status(self):
        products = shopify_mock.generate_mock_products()
        customers = shopify_mock.generate_mock_customers(10, rng=random.Random("cancel-check"))
        orders = shopify_mock.generate_mock_orders(customers, products, 200, rng=random.Random("cancel-check"))
        cancelled = [o for o in orders if o["cancelled_at"] is not None]
        assert cancelled, "expected at least one cancelled order in a 200-order sample"
        assert all(o["fulfillment_status"] is None for o in cancelled)


class TestAdSpendMockData:
    @pytest.mark.parametrize("mock_module", [google_ads_mock, meta_ads_mock])
    def test_clicks_never_exceed_impressions(self, mock_module):
        campaigns = mock_module.generate_mock_campaigns()
        rows = mock_module.generate_mock_insights(campaigns, since_days=5, rng=random.Random("spend-check"))
        for row in rows:
            metrics = row.get("metrics", row)  # google_ads nests under "metrics", meta_ads doesn't
            impressions = int(metrics["impressions"])
            clicks = int(metrics["clicks"])
            assert 0 < clicks <= impressions

    @pytest.mark.parametrize("mock_module", [google_ads_mock, meta_ads_mock])
    def test_same_seed_regenerates_identical_spend(self, mock_module):
        campaigns = mock_module.generate_mock_campaigns()
        first = mock_module.generate_mock_insights(campaigns, since_days=5, rng=random.Random("spend-seed"))
        second = mock_module.generate_mock_insights(campaigns, since_days=5, rng=random.Random("spend-seed"))
        assert first == second


class TestNetsuiteMockData:
    def test_skus_match_shopify_catalog_for_entity_resolution(self):
        # Per mock_data.py's own docstring: NetSuite SKUs must match Shopify's so
        # dim_product's SKU-based join actually produces matches in the mock demo.
        shopify_skus = {
            product["variants"][0]["sku"] for product in shopify_mock.generate_mock_products()
        }
        netsuite_skus = {item["sku"] for item in netsuite_mock.generate_mock_items()}
        assert netsuite_skus == shopify_skus

    def test_quantity_available_is_on_hand_minus_committed(self):
        items = netsuite_mock.generate_mock_items()
        balances = netsuite_mock.generate_mock_inventory_balances(items, rng=random.Random("inv-check"))
        for b in balances:
            assert b["quantityavailable"] == b["quantityonhand"] - b["quantitycommitted"]
