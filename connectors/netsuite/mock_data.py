"""Synthetic NetSuite-shaped data. SKUs deliberately match connectors/shopify/mock_data.py's
PRODUCT_CATALOG (SKU-1000..SKU-1004) so the SKU-based entity resolution in dim_product (doc
Sec 5.3) actually produces matches in the mock-data demo -- otherwise "connect NetSuite and
watch gross margin stop being an estimate" would be true in code but never visible without
a real store AND a real NetSuite account lined up with matching SKUs.
"""
import random as random_module

# (sku, display_name, unit_cost) -- unit_cost set to ~45-55% of the matching Shopify
# unit_price (see shopify/mock_data.py's PRODUCT_CATALOG) for a plausible gross margin.
ITEM_CATALOG = [
    ("SKU-1000", "Classic Tee", 13.50),
    ("SKU-1001", "Canvas Tote", 16.00),
    ("SKU-1002", "Ceramic Mug", 7.50),
    ("SKU-1003", "Wool Beanie", 10.50),
    ("SKU-1004", "Leather Wallet", 27.00),
]


def generate_mock_items(seed_base=4000):
    return [
        {"id": str(seed_base + i), "sku": sku, "displayname": name, "cost": str(cost)}
        for i, (sku, name, cost) in enumerate(ITEM_CATALOG)
    ]


def generate_mock_inventory_balances(items, rng=None):
    rng = rng or random_module
    balances = []
    for item in items:
        on_hand = rng.randint(20, 500)
        committed = rng.randint(0, 40)
        balances.append({
            "sku": item["sku"],
            "item_id": item["id"],
            "quantityonhand": on_hand,
            "quantitycommitted": committed,
            "quantityavailable": on_hand - committed,
        })
    return balances
