"""Extracts NetSuite data for one connection and lands it in raw.netsuite_* -- same
upsert-by-natural-key pattern as the other connectors.

Inventory balances are a daily snapshot fact (doc Sec 5.2: "one row per product per day"),
but NetSuite's API just returns a current balance with no date -- the date is OURS to
stamp at extraction time, folded into the upsert key as f"{item_id}:{snapshot_date}" so
running the sync more than once in a day updates today's row instead of creating a second
one, while running it on consecutive days correctly accumulates real history.
"""
import json
import logging
import os
from datetime import datetime, timezone

from psycopg2.extras import execute_values

from client import NetSuiteClient
import mock_data

logger = logging.getLogger(__name__)

RAW_TABLES = {
    "items": "raw.netsuite_items",
    "inventory_balances": "raw.netsuite_inventory_balances",
}


def _upsert(cursor, table, tenant_id, records, id_fn):
    if not records:
        return 0
    rows = [(tenant_id, id_fn(record), json.dumps(record), None) for record in records]
    execute_values(
        cursor,
        f"""
        INSERT INTO {table} (tenant_id, source_id, payload, source_updated_at)
        VALUES %s
        ON CONFLICT (tenant_id, source_id) DO UPDATE SET
            payload = EXCLUDED.payload,
            _loaded_at = now()
        """,
        rows,
    )
    return len(rows)


def _stamp_snapshot_date(balances, snapshot_date):
    for balance in balances:
        balance["snapshot_date"] = snapshot_date
    return balances


def _item_id(record):
    return str(record["id"])


def _balance_id(record):
    return f"{record['item_id']}:{record['snapshot_date']}"


def _extract_and_load_mock(db_conn, connection, tenant_id):
    import random

    rng = random.Random(str(connection["connection_id"]))
    items = mock_data.generate_mock_items()
    balances = _stamp_snapshot_date(
        mock_data.generate_mock_inventory_balances(items, rng=rng),
        datetime.now(timezone.utc).strftime("%Y-%m-%d"),
    )
    with db_conn.cursor() as cur:
        counts = {
            "items": _upsert(cur, RAW_TABLES["items"], tenant_id, items, _item_id),
            "inventory_balances": _upsert(cur, RAW_TABLES["inventory_balances"], tenant_id, balances, _balance_id),
        }
    db_conn.commit()
    return counts


def _extract_and_load_live(db_conn, connection, tenant_id, credentials):
    client = NetSuiteClient(
        account_id=credentials["account_id"],
        consumer_key=credentials["consumer_key"],
        consumer_secret=credentials["consumer_secret"],
        token_id=credentials["token_id"],
        token_secret=credentials["token_secret"],
    )

    items = list(client.get_items())
    balances = _stamp_snapshot_date(
        list(client.get_inventory_balances()), datetime.now(timezone.utc).strftime("%Y-%m-%d")
    )
    with db_conn.cursor() as cur:
        counts = {
            "items": _upsert(cur, RAW_TABLES["items"], tenant_id, items, _item_id),
            "inventory_balances": _upsert(cur, RAW_TABLES["inventory_balances"], tenant_id, balances, _balance_id),
        }
    db_conn.commit()
    return counts


def sync_connection(db_conn, connection, fernet_key):
    tenant_id = connection["tenant_id"]
    sync_started_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    if connection["use_mock_data"]:
        counts = _extract_and_load_mock(db_conn, connection, tenant_id)
    else:
        if not fernet_key:
            raise RuntimeError("FERNET_KEY is not configured; required to decrypt live connection credentials")
        from cryptography.fernet import Fernet

        with db_conn.cursor() as cur:
            cur.execute("SELECT ciphertext FROM app.secrets WHERE secret_id = %s", (connection["secret_ref"],))
            row = cur.fetchone()
        fernet = Fernet(fernet_key.encode())
        credentials = json.loads(fernet.decrypt(bytes(row[0])).decode("utf-8"))
        counts = _extract_and_load_live(db_conn, connection, tenant_id, credentials)

    with db_conn.cursor() as cur:
        cur.execute(
            """UPDATE app.connections
               SET last_synced_at = now(), status = 'active', last_error = NULL, sync_cursor = %s
               WHERE connection_id = %s""",
            (sync_started_at, connection["connection_id"]),
        )
    db_conn.commit()
    logger.info("synced connection %s: %s", connection["connection_id"], counts)
    return counts
