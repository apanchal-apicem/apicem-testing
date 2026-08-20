"""Extracts Google Ads data for one connection and lands it in raw.google_ads_* -- same
upsert-by-natural-key pattern as connectors/shopify/sync.py.

Ad platforms don't have a meaningful per-row "updated_at" the way Shopify orders do --
insights are a daily metrics snapshot, so incremental sync here means "re-fetch the last
few days plus anything new" (metrics can be revised for a few days after the fact) rather
than filtering by a change timestamp.
"""
import json
import logging
import os
from datetime import datetime, timedelta, timezone

from psycopg2.extras import execute_values

from client import GoogleAdsClient
import mock_data

logger = logging.getLogger(__name__)

RAW_TABLES = {
    "campaigns": "raw.google_ads_campaigns",
    "insights": "raw.google_ads_insights",
}

MOCK_INSIGHT_DAYS = 90
# How many days of insights to re-fetch even on an incremental sync, since ad platforms
# revise attributed conversions for a few days after the fact.
INCREMENTAL_LOOKBACK_DAYS = 7
INITIAL_BACKFILL_DAYS = int(os.environ.get("ADS_INITIAL_BACKFILL_DAYS", "90"))


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


def _campaign_id(record):
    return str(record["campaign"]["id"])


def _insight_id(record):
    return f"{record['campaign']['id']}:{record['segments']['date']}"


def _extract_and_load_mock(db_conn, connection, tenant_id):
    import random

    rng = random.Random(str(connection["connection_id"]))
    campaigns = mock_data.generate_mock_campaigns()
    insights = mock_data.generate_mock_insights(campaigns, since_days=MOCK_INSIGHT_DAYS, rng=rng)
    with db_conn.cursor() as cur:
        counts = {
            "campaigns": _upsert(cur, RAW_TABLES["campaigns"], tenant_id, campaigns, _campaign_id),
            "insights": _upsert(cur, RAW_TABLES["insights"], tenant_id, insights, _insight_id),
        }
    db_conn.commit()
    return counts


def _extract_and_load_live(db_conn, connection, tenant_id, credentials):
    client = GoogleAdsClient(
        client_id=credentials["client_id"],
        client_secret=credentials["client_secret"],
        refresh_token=credentials["refresh_token"],
        developer_token=credentials["developer_token"],
        customer_id=credentials["customer_id"],
        login_customer_id=credentials.get("login_customer_id"),
    )

    now = datetime.now(timezone.utc)
    if connection.get("sync_cursor"):
        date_from = (now - timedelta(days=INCREMENTAL_LOOKBACK_DAYS)).strftime("%Y-%m-%d")
    else:
        date_from = (now - timedelta(days=INITIAL_BACKFILL_DAYS)).strftime("%Y-%m-%d")
        logger.info(
            "connection %s: first sync, bounding insights to the last %s days",
            connection["connection_id"], INITIAL_BACKFILL_DAYS,
        )
    date_to = now.strftime("%Y-%m-%d")

    campaigns = list(client.get_campaigns())
    insights = list(client.get_insights(date_from, date_to))
    with db_conn.cursor() as cur:
        counts = {
            "campaigns": _upsert(cur, RAW_TABLES["campaigns"], tenant_id, campaigns, _campaign_id),
            "insights": _upsert(cur, RAW_TABLES["insights"], tenant_id, insights, _insight_id),
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
