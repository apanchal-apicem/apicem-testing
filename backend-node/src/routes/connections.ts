// Ports backend/app/routers/connections.py AND sync.py (merged in Python too -- both mount
// under /connections) route-for-route.
import type { FastifyInstance } from "fastify";

import { withTenant } from "../db.js";
import { Fernet } from "../fernet.js";
import { settings } from "../config.js";
import { requireAuth, requireRole } from "../security.js";

// Each source type's own required credential field names -- validated generically instead of
// one hardcoded shop_domain/access_token shape. Keep this in sync with what each
// connectors/<source>/sync.ts's live-credential path actually reads out of `credentials`.
const REQUIRED_CREDENTIAL_FIELDS: Record<string, string[]> = {
  shopify: ["shop_domain", "access_token"],
  google_ads: ["client_id", "client_secret", "refresh_token", "developer_token", "customer_id"],
  meta_ads: ["access_token", "ad_account_id"],
  netsuite: ["account_id", "consumer_key", "consumer_secret", "token_id", "token_secret"],
};

export default async function connectionsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    "/connections",
    { preHandler: [requireAuth, requireRole("owner", "admin")] },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const body = request.body as {
        source_type?: string;
        display_name?: string;
        name?: string;
        use_mock_data?: boolean;
        credentials?: Record<string, string>;
      };
      const sourceType = body.source_type ?? "shopify";
      const useMockData = body.use_mock_data ?? true;
      const displayName =
        body.display_name?.trim() ||
        body.name?.trim() ||
        `${sourceType.charAt(0).toUpperCase() + sourceType.slice(1)} connection`;

      if (!(sourceType in REQUIRED_CREDENTIAL_FIELDS)) {
        return reply.code(400).send({
          detail: `Unknown source_type. Supported: ${JSON.stringify(Object.keys(REQUIRED_CREDENTIAL_FIELDS).sort())}`,
        });
      }

      return withTenant(currentUser.tenantId, async (client) => {
        let secretId: string | null = null;
        if (!useMockData) {
          const required = REQUIRED_CREDENTIAL_FIELDS[sourceType];
          const missing = required.filter((f) => !(body.credentials ?? {})[f]);
          if (missing.length > 0) {
            return reply.code(400).send({
              detail: `Missing required credential fields for ${sourceType}: ${JSON.stringify(missing)}`,
            });
          }
          if (!settings.fernetKey) {
            return reply.code(503).send({
              detail: "Server is not configured with a FERNET_KEY; only mock connections are available",
            });
          }
          const fernet = new Fernet(settings.fernetKey);
          const ciphertext = fernet.encrypt(Buffer.from(JSON.stringify(body.credentials)));
          const secretResult = await client.query<{ secret_id: string }>(
            "INSERT INTO app.secrets (tenant_id, ciphertext) VALUES ($1, $2) RETURNING secret_id",
            [currentUser.tenantId, ciphertext],
          );
          secretId = secretResult.rows[0].secret_id;
        }

        const result = await client.query(
          `INSERT INTO app.connections (tenant_id, source_type, display_name, secret_ref, use_mock_data, status)
           VALUES ($1, $2, $3, $4, $5, 'pending')
           RETURNING connection_id, source_type, display_name, status, use_mock_data, last_synced_at, last_error, created_at`,
          [currentUser.tenantId, sourceType, displayName, secretId, useMockData],
        );
        return reply.code(201).send(result.rows[0]);
      });
    },
  );

  fastify.get("/connections", { preHandler: requireAuth }, async (request, reply) => {
    const currentUser = request.currentUser!;
    return withTenant(currentUser.tenantId, async (client) => {
      const result = await client.query(
        `SELECT connection_id, source_type, display_name, status, use_mock_data, last_synced_at, last_error, created_at
         FROM app.connections ORDER BY created_at DESC`,
      );
      return reply.send(result.rows);
    });
  });

  fastify.delete(
    "/connections/:connectionId",
    { preHandler: [requireAuth, requireRole("owner", "admin")] },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const { connectionId } = request.params as { connectionId: string };
      return withTenant(currentUser.tenantId, async (client) => {
        const result = await client.query<{ secret_ref: string | null }>(
          "SELECT secret_ref FROM app.connections WHERE connection_id = $1",
          [connectionId],
        );
        const row = result.rows[0];
        if (!row) {
          return reply.code(404).send({ detail: "Connection not found" });
        }
        await client.query("DELETE FROM app.connections WHERE connection_id = $1", [connectionId]);
        if (row.secret_ref) {
          await client.query("DELETE FROM app.secrets WHERE secret_id = $1", [row.secret_ref]);
        }
        return reply.code(204).send();
      });
    },
  );

  fastify.get("/connections/:connectionId/job_runs", { preHandler: requireAuth }, async (request, reply) => {
    const currentUser = request.currentUser!;
    const { connectionId } = request.params as { connectionId: string };
    return withTenant(currentUser.tenantId, async (client) => {
      const result = await client.query(
        `SELECT job_run_id, job_type, status, started_at, finished_at, error_message, records_synced
         FROM app.job_runs
         WHERE connection_id = $1
         ORDER BY started_at DESC LIMIT 20`,
        [connectionId],
      );
      return reply.send(result.rows);
    });
  });

  // From sync.py in the Python version (mounted under the same /connections prefix there
  // too) -- marks a connection for immediate pickup by the orchestrator's poll loop. The
  // actual extraction always runs out-of-band in the orchestrator process.
  fastify.post(
    "/connections/:connectionId/sync-now",
    { preHandler: [requireAuth, requireRole("owner", "admin")] },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const { connectionId } = request.params as { connectionId: string };
      return withTenant(currentUser.tenantId, async (client) => {
        const result = await client.query(
          `UPDATE app.connections SET requested_sync_at = now()
           WHERE connection_id = $1
           RETURNING connection_id`,
          [connectionId],
        );
        if (result.rows.length === 0) {
          return reply.code(404).send({ detail: "Connection not found" });
        }
        return reply.code(202).send({ status: "sync_requested" });
      });
    },
  );
}
