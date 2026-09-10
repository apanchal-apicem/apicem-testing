// Ports backend/app/routers/dashboards.py exactly.
import type { FastifyInstance } from "fastify";

import { availableCapabilities, dashboardsForCapabilities, getDashboard } from "../dashboardRegistry.js";
import { withTenant } from "../db.js";
import * as dm from "../dateMath.js";
import { computeMetric } from "../metricRegistry.js";
import { requireAuth } from "../security.js";
import type { PgClient } from "../db.js";

async function tenantCapabilities(client: PgClient): Promise<Set<string>> {
  const result = await client.query<{ source_type: string }>("SELECT source_type FROM app.connections WHERE status = 'active'");
  return availableCapabilities(result.rows.map((r) => r.source_type));
}

function isSubset(subset: Set<string>, superset: Set<string>): boolean {
  for (const item of subset) if (!superset.has(item)) return false;
  return true;
}

export default async function dashboardsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/dashboards", { preHandler: requireAuth }, async (request, reply) => {
    const currentUser = request.currentUser!;
    return withTenant(currentUser.tenantId, async (client) => {
      const capabilities = await tenantCapabilities(client);
      const eligible = dashboardsForCapabilities(capabilities);
      return reply.send(
        eligible.map((d) => ({
          id: d.id,
          title: d.title,
          date_note: d.dateNote,
          widgets: d.widgets.map((w) => ({ type: w.type, metric: w.metric, label: w.label })),
        })),
      );
    });
  });

  fastify.get("/dashboards/:dashboardId", { preHandler: requireAuth }, async (request, reply) => {
    const currentUser = request.currentUser!;
    const { dashboardId } = request.params as { dashboardId: string };
    const query = request.query as { start_date?: string; end_date?: string };

    const dashboard = getDashboard(dashboardId);
    if (!dashboard) {
      return reply.code(404).send({ detail: "Dashboard not found" });
    }

    return withTenant(currentUser.tenantId, async (client) => {
      const capabilities = await tenantCapabilities(client);
      if (!isSubset(dashboard.requiredCapabilities, capabilities)) {
        return reply.code(403).send({ detail: "Connect a required data source to unlock this dashboard" });
      }

      const endDate = query.end_date ? dm.fromISO(query.end_date) : dm.today();
      const startDate = query.start_date ? dm.fromISO(query.start_date) : dm.addDays(endDate, -30);

      const widgets = [];
      for (const widget of dashboard.widgets) {
        // Period-over-period comparison only makes sense for a single point-in-time number,
        // not a trend series or a ranked table.
        const compare = widget.type === "kpi";
        const result = await computeMetric(client, currentUser.tenantId, widget.metric, dm.toISO(startDate), dm.toISO(endDate), compare);
        widgets.push({
          type: widget.type,
          metric: widget.metric,
          label: widget.label,
          value: result.value ?? null,
          previous_value: result.previous_value ?? null,
          delta_pct: result.delta_pct ?? null,
          is_estimated: result.is_estimated ?? false,
          series: result.series ?? null,
          rows: result.rows ?? null,
        });
      }
      return reply.send({ id: dashboard.id, title: dashboard.title, date_note: dashboard.dateNote, widgets });
    });
  });
}
