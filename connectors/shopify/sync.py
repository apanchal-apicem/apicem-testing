"""Extracts Shopify data for one connection and lands it in raw.shopify_* (doc Sec 1.2, 2.4,
3.4). Runs as the Postgres owner role, so it operates across all tenants without needing a
per-tenant RLS session variable -- table ownership already bypasses RLS.

Upserts by (tenant_id, source_id) so a re-run of a partially-failed sync never duplicates
rows, and persists the high-water-mark cursor durably on app.connections so a crash mid-sync
resumes rather than restarting (doc Sec 2.3, 2.4).
"""
import itertools
import json
import logging
import os
import random
from datetime import datetime, timedelta, timezone

from cryptography.fernet import Fernet
from psycopg2.extras import execute_values

from client import ShopifyClient
import mock_data

logger = logging.getLogger(__name__)

RAW_TABLES = {
    "orders": "raw.shopify_orders",
    "customers": "raw.shopify_customers",
    "products": "raw.shopify_products",
}

MOCK_CUSTOMER_COUNT = 40
MOCK_ORDER_COUNT = 250

# On a connection's FIRST sync (no cursor yet), how far back to fetch order history, rather
# than an unbounded fetch of a real store's entire history before landing a single row (doc
# Sec 3.5: "communicate these source-imposed limits to the client during onboarding").
INITIAL_BACKFILL_DAYS = int(os.environ.get("SHOPIFY_INITIAL_BACKFILL_DAYS", "365"))

# Upsert in batches while paginating, instead of materializing an entire live store's
# history in memory and writing it all at once -- this is what turned one real sync into an
# hours-long, zero-visible-progress hang.
UPSERT_BATCH_SIZE = 250


def _upsert(cursor, table, tenant_id, records, id_field="id", updated_field="updated_at"):
    if not records:
        return 0
    rows = [
        (
            tenant_id,
            str(record[id_field]),
            json.dumps(record),
            record.get(updated_field),
        )
        for record in records
    ]
    execute_values(
        cursor,
        f"""
        INSERT INTO {table} (tenant_id, source_id, payload, source_updated_at)
        VALUES %s
        ON CONFLICT (tenant_id, source_id) DO UPDATE SET
            payload = EXCLUDED.payload,
            source_updated_at = EXCLUDED.source_updated_at,
            _loaded_at = now()
        """,
        rows,
    )
    return len(rows)


def _upsert_streaming(db_conn, table, tenant_id, records_iter):
    """Upserts a generator in batches, committing after each one, so a slow or interrupted
    sync shows real incremental progress in raw.* instead of an all-or-nothing black box."""
    total = 0
    iterator = iter(records_iter)
    while True:
        batch = list(itertools.islice(iterator, UPSERT_BATCH_SIZE))
        if not batch:
            break
        with db_conn.cursor() as cur:
            total += _upsert(cur, table, tenant_id, batch)
        db_conn.commit()
    return total


def _extract_and_load_mock(db_conn, connection, tenant_id):
    # Mock volume is small and fixed-size -- no need for the streaming path below.
    rng = random.Random(str(connection["connection_id"]))
    products = mock_data.generate_mock_products()
    customers = mock_data.generate_mock_customers(MOCK_CUSTOMER_COUNT, rng=rng)
    orders = mock_data.generate_mock_orders(customers, products, MOCK_ORDER_COUNT, rng=rng)
    with db_conn.cursor() as cur:
        counts = {
            "orders": _upsert(cur, RAW_TABLES["orders"], tenant_id, orders),
            "customers": _upsert(cur, RAW_TABLES["customers"], tenant_id, customers),
            "products": _upsert(cur, RAW_TABLES["products"], tenant_id, products),
        }
    db_conn.commit()
    return counts


def _extract_and_load_live(db_conn, connection, tenant_id, credentials):
    client = ShopifyClient(credentials["shop_domain"], credentials["access_token"])
    updated_at_min = connection.get("sync_cursor")
    created_at_min = None
    if not updated_at_min:
        created_at_min = (datetime.now(timezone.utc) - timedelta(days=INITIAL_BACKFILL_DAYS)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        logger.info(
            "connection %s: first sync, bounding order history to the last %s days (created_at_min=%s)",
            connection["connection_id"], INITIAL_BACKFILL_DAYS, created_at_min,
        )

    counts = {
        "orders": _upsert_streaming(
            db_conn, RAW_TABLES["orders"], tenant_id,
            client.get_orders(updated_at_min=updated_at_min, created_at_min=created_at_min),
        ),
        # Bounded the same way as orders: a repeat customer who signed up before this
        # window but ordered within it won't be fetched on THIS pass, so their orders'
        # customer_key join is unmatched until they place another order (which lands them
        # in a later incremental sync) -- an accepted MVP tradeoff of ANY bounded initial
        # backfill (doc Sec 3.5), not a silent bug. Products are deliberately NOT bounded:
        # a product created years ago can still be actively selling today, so "recently
        # created" is the wrong filter for the product catalog.
        "customers": _upsert_streaming(
            db_conn, RAW_TABLES["customers"], tenant_id,
            client.get_customers(updated_at_min=updated_at_min, created_at_min=created_at_min),
        ),
        "products": _upsert_streaming(
            db_conn, RAW_TABLES["products"], tenant_id, client.get_products(updated_at_min=updated_at_min),
        ),
    }
    return counts


def sync_connection(db_conn, connection, fernet_key):
    """connection: dict with connection_id, tenant_id, use_mock_data, sync_cursor, secret_ref."""
    tenant_id = connection["tenant_id"]
    sync_started_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    if connection["use_mock_data"]:
        counts = _extract_and_load_mock(db_conn, connection, tenant_id)
    else:
        if not fernet_key:
            raise RuntimeError("FERNET_KEY is not configured; required to decrypt live connection credentials")
        with db_conn.cursor() as cur:
            cur.execute(
                "SELECT ciphertext FROM app.secrets WHERE secret_id = %s",
                (connection["secret_ref"],),
            )
            row = cur.fetchone()
        fernet = Fernet(fernet_key.encode())
        credentials = json.loads(fernet.decrypt(bytes(row[0])).decode("utf-8"))
        counts = _extract_and_load_live(db_conn, connection, tenant_id, credentials)

    with db_conn.cursor() as cur:
        cur.execute(
            """
            UPDATE app.connections
            -- sync_cursor becomes this run's start time: the next sync only asks Shopify for
            -- records updated since NOW, instead of (before this fix) never persisting a
            -- cursor at all and silently re-fetching a live store's entire history on every
            -- single scheduled sync forever.
            SET last_synced_at = now(), status = 'active', last_error = NULL, sync_cursor = %s
            WHERE connection_id = %s
            """,
            (sync_started_at, connection["connection_id"]),
        )
    db_conn.commit()
    logger.info("synced connection %s: %s", connection["connection_id"], counts)
    return counts
