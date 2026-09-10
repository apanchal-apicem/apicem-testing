// Ports backend/app/routers/assistant.py exactly.
import type { FastifyInstance } from "fastify";

import { askAssistant, buildCapabilities } from "../assistantIntents.js";
import { withTenant } from "../db.js";
import { requireAuth } from "../security.js";
import type { PgClient } from "../db.js";
import type { MetricResult } from "../metricRegistry.js";

// How much of a user's own chat history to load back -- generous enough that "scroll up"
// feels complete for normal use, bounded so the page never has to render an unbounded
// transcript.
const HISTORY_LIMIT = 200;

async function saveMessage(
  client: PgClient,
  tenantId: string,
  userId: string,
  role: "user" | "assistant",
  content: string,
  results: unknown[],
): Promise<void> {
  await client.query(
    `INSERT INTO app.assistant_messages (tenant_id, user_id, role, content, results)
     VALUES ($1, $2, $3, $4, CAST($5 AS jsonb))`,
    [tenantId, userId, role, content, results.length > 0 ? JSON.stringify(results) : null],
  );
}

export default async function assistantRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/assistant/capabilities", { preHandler: requireAuth }, async (_request, reply) => {
    return reply.send(buildCapabilities());
  });

  fastify.get("/assistant/history", { preHandler: requireAuth }, async (request, reply) => {
    const currentUser = request.currentUser!;
    return withTenant(currentUser.tenantId, async (client) => {
      // Per-user, not shared across the tenant's team -- RLS already scopes this to the
      // tenant, this adds the finer-grained user_id filter on top (defense in depth).
      const result = await client.query(
        `SELECT message_id, role, content, results, created_at
         FROM app.assistant_messages
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [currentUser.userId, HISTORY_LIMIT],
      );
      const messages = result.rows.map((row) => ({
        message_id: String(row.message_id),
        role: row.role,
        content: row.content,
        results: row.results ?? [],
        created_at: row.created_at,
      }));
      messages.reverse(); // oldest first, matching how the chat renders top to bottom
      return reply.send(messages);
    });
  });

  fastify.delete("/assistant/history", { preHandler: requireAuth }, async (request, reply) => {
    const currentUser = request.currentUser!;
    return withTenant(currentUser.tenantId, async (client) => {
      await client.query("DELETE FROM app.assistant_messages WHERE user_id = $1", [currentUser.userId]);
      return reply.code(204).send();
    });
  });

  fastify.post("/assistant/ask", { preHandler: requireAuth }, async (request, reply) => {
    const currentUser = request.currentUser!;
    const body = request.body as {
      message?: string;
      previous_metric?: string;
      previous_start_date?: string;
      previous_end_date?: string;
    };
    if (!body.message) {
      return reply.code(422).send({ detail: "message is required" });
    }

    return withTenant(currentUser.tenantId, async (client) => {
      // Deterministic phrase matching is the primary path; an optional Groq classifier only
      // ever kicks in as a last resort when nothing else matched (still never lets an LLM
      // state a number or word a reply). Both sides of the exchange are saved below so the
      // chat transcript itself survives a refresh, a nav away, or logging back in later.
      const outcome = await askAssistant(
        client,
        currentUser.tenantId,
        body.message!,
        body.previous_metric ?? null,
        body.previous_start_date ?? null,
        body.previous_end_date ?? null,
        currentUser.isDemo,
      );
      await saveMessage(client, currentUser.tenantId, currentUser.userId, "user", body.message!, []);
      await saveMessage(
        client,
        currentUser.tenantId,
        currentUser.userId,
        "assistant",
        outcome.reply,
        outcome.results as unknown as MetricResult[],
      );
      return reply.send({ reply: outcome.reply, results: outcome.results });
    });
  });
}
