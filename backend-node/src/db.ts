// This file is the single riskiest module in the whole rewrite: it replicates
// backend/app/security.py's set_tenant()/get_tenant_db() -- the ENTIRE mechanism Postgres RLS
// depends on to keep one tenant's rows invisible to another (backend/tests/test_rls_isolation.py
// is explicitly called out, on the Python side, as the single most load-bearing test in the
// whole suite -- port it here FIRST and keep it green before trusting anything else).
import pg from "pg";

import { settings } from "./config.js";

// pg's default type parser for DATE columns (OID 1082) converts "2026-08-08" into a JS Date
// object representing LOCAL midnight -- when that Date is later JSON-serialized (Fastify's
// default), it converts to UTC and can shift the calendar day entirely depending on the
// server's timezone offset (confirmed live: came back as "2026-08-07T18:30:00.000Z" on this
// machine for a plain "2026-08-08" value). Python's Pydantic instead serializes a bare date as
// a plain "YYYY-MM-DD" string with no time/zone component at all -- overriding the parser to
// just pass the raw string through is what actually matches that contract (metric_registry.ts
// resolves date_key/order_date_key columns this way; the frontend expects a bare date string).
const PG_DATE_OID = 1082;
pg.types.setTypeParser(PG_DATE_OID, (value: string) => value);

// Connects ONLY as the restricted apicem_app role -- never as the table owner -- so Postgres
// always subjects every query to RLS policies, matching db.py's own comment verbatim.
const pool = new pg.Pool({
  host: settings.postgresHost,
  port: settings.postgresPort,
  database: settings.postgresDb,
  user: settings.apicemAppDbUser,
  password: settings.apicemAppDbPassword,
});

export type PgClient = pg.PoolClient;

/**
 * Checks out ONE connection from the pool, opens a transaction, sets the RLS session variable
 * for that transaction only (`SET LOCAL` scopes to the current transaction, matching one
 * request's lifecycle exactly the way the Python backend's per-request SQLAlchemy Session
 * did), runs `fn` against that same connection, then commits (or rolls back on error) and
 * releases the connection back to the pool.
 *
 * This is the ONLY way any tenant-scoped query should ever run. tenantId always comes from the
 * verified JWT (see security.ts), never from client-supplied input -- same invariant the
 * Python backend's get_tenant_db() enforced by construction.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (client: PgClient) => Promise<T>,
  userId?: string,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Postgres's SET/SET LOCAL commands do NOT accept bind parameters at the protocol level
    // (node-postgres's $1 uses the extended query protocol, which SET rejects with "syntax
    // error at or near $1") -- set_config() is a real function and DOES support them, and is
    // the documented-safe way to do this without falling back to manual string interpolation
    // (which would otherwise need its own UUID-shape validation to stay injection-safe).
    // is_local=true makes this scoped to the current transaction, same as SET LOCAL.
    await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
    if (userId) {
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
    }
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {
      // Rolling back on a connection whose transaction already aborted is expected; the
      // original error is what matters and is re-thrown below regardless.
    });
    throw err;
  } finally {
    client.release();
  }
}

/**
 * For the rare pre-tenant-context queries (signup's tenant/user creation, login's lookup by
 * email before any JWT exists) that still need a real transaction+RLS-var, just with the
 * tenant id decided partway through instead of known up front. Mirrors auth.py's own pattern
 * of setting the tenant var mid-transaction, right after inserting the new tenant row.
 */
export async function withTransaction<T>(fn: (client: PgClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
