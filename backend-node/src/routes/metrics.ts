// Ports backend/app/routers/metrics.py exactly.
import type { FastifyInstance } from "fastify";

import { withTenant } from "../db.js";
import * as dm from "../dateMath.js";
import { computeMetric, SCALAR_METRICS, SERIES_METRICS, TABLE_METRICS } from "../metricRegistry.js";
import { executeAdHocQuery, type AdHocQueryInput } from "../queryEngine.js";
import { requireAuth } from "../security.js";

export default async function metricsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/metrics", { preHandler: requireAuth }, async (_request, reply) => {
    const toLabelMap = (registry: Record<string, { label: string }>) =>
      Object.fromEntries(Object.entries(registry).map(([k, v]) => [k, v.label]));
    return reply.send({
      scalar: toLabelMap(SCALAR_METRICS),
      series: toLabelMap(SERIES_METRICS),
      table: toLabelMap(TABLE_METRICS),
    });
  });

  fastify.get("/metrics/:metricKey", { preHandler: requireAuth }, async (request, reply) => {
    const currentUser = request.currentUser!;
    const { metricKey } = request.params as { metricKey: string };
    const query = request.query as { start_date?: string; end_date?: string; compare?: string };

    const endDate = query.end_date ? dm.fromISO(query.end_date) : dm.today();
    const startDate = query.start_date ? dm.fromISO(query.start_date) : dm.addDays(endDate, -30);
    const compare = query.compare === "true";

    return withTenant(currentUser.tenantId, async (client) => {
      try {
        const result = await computeMetric(client, currentUser.tenantId, metricKey, dm.toISO(startDate), dm.toISO(endDate), compare);
        return reply.send(result);
      } catch {
        return reply.code(404).send({ detail: `Unknown metric: ${metricKey}` });
      }
    });
  });

  const handleQuery = async (request: any, reply: any) => {
    const currentUser = request.currentUser!;
    const body = (request.body as AdHocQueryInput) ?? {};

    return withTenant(currentUser.tenantId, async (client) => {
      try {
        const result = await executeAdHocQuery(client, currentUser.tenantId, body);
        return reply.send(result);
      } catch (err: any) {
        request.log.error(err, "Failed to execute ad-hoc query");
        return reply.code(500).send({ detail: "Query execution failed", error: err?.message });
      }
    });
  };

  fastify.post("/query", { preHandler: requireAuth }, handleQuery);
  fastify.post("/metrics/query", { preHandler: requireAuth }, handleQuery);
}
