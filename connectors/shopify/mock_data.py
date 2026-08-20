"""Synthetic Shopify-shaped data so the full pipeline (raw -> staging -> marts -> dashboard)
is runnable and demoable without a live Shopify store or OAuth credentials.

Records are shaped exactly like real Shopify Admin API objects so they flow through the same
staging models as a real connection would -- swapping in the real ShopifyClient later requires
no changes downstream.

Callers pass an `rng` seeded per-connection (see connectors/shopify/sync.py) so repeat syncs
of the same mock connection regenerate the SAME orders/customers (by id) rather than growing
raw.shopify_orders unboundedly on every sync -- a real incremental sync only re-fetches what
actually changed, and a mock store's data isn't changing between syncs either.
"""
import random as random_module
from datetime import datetime, timedelta, timezone

FIRST_NAMES = ["Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Sam", "Jamie"]
LAST_NAMES = ["Smith", "Johnson", "Lee", "Garcia", "Brown", "Davis", "Miller", "Wilson"]
PRODUCT_CATALOG = [
    {"title": "Classic Tee", "type": "Apparel", "vendor": "Acme Co", "price": "28.00"},
    {"title": "Canvas Tote", "type": "Accessories", "vendor": "Acme Co", "price": "34.00"},
    {"title": "Ceramic Mug", "type": "Home", "vendor": "Acme Co", "price": "18.00"},
    {"title": "Wool Beanie", "type": "Apparel", "vendor": "Acme Co", "price": "22.00"},
    {"title": "Leather Wallet", "type": "Accessories", "vendor": "Acme Co", "price": "56.00"},
]


def _iso(dt):
    return dt.strftime("%Y-%m-%dT%H:%M:%S%z")


def generate_mock_products(seed_base=1):
    products = []
    for i, item in enumerate(PRODUCT_CATALOG):
        product_id = seed_base * 1000 + i
        products.append({
            "id": product_id,
            "title": item["title"],
            "product_type": item["type"],
            "vendor": item["vendor"],
            "variants": [{"sku": f"SKU-{product_id}", "price": item["price"]}],
        })
    return products


def generate_mock_customers(n, seed_base=1, since_days=180, rng=None):
    rng = rng or random_module
    customers = []
    now = datetime.now(timezone.utc)
    for i in range(n):
        customer_id = seed_base * 10000 + i
        created_at = now - timedelta(days=rng.randint(0, since_days))
        orders_count = rng.randint(1, 8)
        first = rng.choice(FIRST_NAMES)
        last = rng.choice(LAST_NAMES)
        customers.append({
            "id": customer_id,
            "email": f"{first.lower()}.{last.lower()}{customer_id}@example.com",
            "first_name": first,
            "last_name": last,
            "created_at": _iso(created_at),
            "orders_count": orders_count,
            "total_spent": str(round(orders_count * rng.uniform(30, 150), 2)),
        })
    return customers


def generate_mock_orders(customers, products, n, since_days=180, rng=None):
    rng = rng or random_module
    orders = []
    now = datetime.now(timezone.utc)
    for i in range(n):
        # Deterministic given rng's seed, unlike uuid.uuid4() -- see module docstring.
        order_id = rng.randint(1, 9_999_999)
        created_at = now - timedelta(
            days=rng.randint(0, since_days),
            hours=rng.randint(0, 23),
        )
        customer = rng.choice(customers)
        num_items = rng.randint(1, 3)
        line_items = []
        subtotal = 0.0
        for _ in range(num_items):
            product = rng.choice(products)
            quantity = rng.randint(1, 3)
            price = float(product["variants"][0]["price"])
            subtotal += price * quantity
            line_items.append({
                "id": rng.randint(1, 9_999_999),
                "product_id": product["id"],
                "sku": product["variants"][0]["sku"],
                "quantity": quantity,
                "price": str(price),
            })

        discount = round(subtotal * rng.choice([0, 0, 0, 0.1]), 2)
        shipping = round(rng.choice([0, 5.99, 8.99]), 2)
        tax = round((subtotal - discount) * 0.08, 2)
        total = round(subtotal - discount + shipping + tax, 2)
        cancelled = rng.random() < 0.03
        post_discount_subtotal = round(subtotal - discount, 2)

        # Refunds are modeled independent of cancellation -- a real Shopify order can be
        # partially or fully refunded without ever being cancelled (a customer returning
        # some items is the normal case, not a cancelled order). Only non-cancelled orders
        # get this path; a cancelled order's own "refunded" financial_status below already
        # covers that separate scenario. ~12% of orders get a refund; most of those are
        # partial (a customer keeping some items), the rest full.
        refunds = []
        financial_status = "refunded" if cancelled else "paid"
        if not cancelled and rng.random() < 0.12:
            is_full_refund = rng.random() < 0.3
            refund_amount = post_discount_subtotal if is_full_refund else round(
                post_discount_subtotal * rng.uniform(0.2, 0.6), 2
            )
            financial_status = "refunded" if is_full_refund else "partially_refunded"
            refunds.append({
                "id": rng.randint(1, 9_999_999),
                "created_at": _iso(created_at + timedelta(days=rng.randint(1, 14))),
                # Mirrors real Shopify's actual nesting (refunds[].transactions[].amount) so
                # the same JSONB-parsing logic in staging works unchanged against a real
                # connection's response, not just this mock shape.
                "transactions": [{"kind": "refund", "status": "success", "amount": str(refund_amount)}],
            })

        orders.append({
            "id": order_id,
            "created_at": _iso(created_at),
            "updated_at": _iso(created_at),
            "cancelled_at": _iso(created_at) if cancelled else None,
            "financial_status": financial_status,
            "fulfillment_status": None if cancelled else rng.choice(["fulfilled", "partial", None]),
            "currency": "USD",
            "customer": {"id": customer["id"]},
            # Real Shopify's subtotal_price is already net of discounts (line items after
            # discount, before shipping/tax) -- total_line_items_price is the pre-discount
            # figure. Storing the pre-discount sum here would make mock data exercise a
            # different (and wrong) code path than a real store ever would.
            "subtotal_price": str(post_discount_subtotal),
            "total_discounts": str(discount),
            "total_shipping_price_set": {"shop_money": {"amount": str(shipping)}},
            "total_tax": str(tax),
            "total_price": str(total),
            "line_items": line_items,
            "refunds": refunds,
        })
    return orders
