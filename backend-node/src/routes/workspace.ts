import type { FastifyInstance } from "fastify";
import { withTenant } from "../db.js";
import { createAccessToken, requireAuth } from "../security.js";

const PLAN_DISPLAY_MAP: Record<string, string> = {
  trial: "starter",
  starter: "starter",
  growth: "growth",
};

function displayPlan(dbPlan?: string): "starter" | "growth" | "enterprise" {
  const mapped = PLAN_DISPLAY_MAP[dbPlan ?? "starter"] ?? "starter";
  return mapped as "starter" | "growth" | "enterprise";
}

export default async function workspaceRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /workspaces - Lists all workspaces the current user belongs to
  fastify.get("/workspaces", { preHandler: requireAuth }, async (request, reply) => {
    const currentUser = request.currentUser!;
    return withTenant(currentUser.tenantId, async (client) => {
      const result = await client.query<{
        tenant_id: string;
        name: string;
        slug: string;
        plan: string;
        role: string;
      }>(
        `SELECT t.tenant_id, t.name, t.slug, t.plan, m.role
         FROM app.workspace_memberships m
         JOIN app.tenants t ON t.tenant_id = m.workspace_id
         WHERE m.user_id = $1
         ORDER BY m.created_at`,
        [currentUser.userId],
      );

      return reply.send(
        result.rows.map((r) => ({
          id: r.tenant_id,
          name: r.name,
          slug: r.slug,
          plan: displayPlan(r.plan),
          myRole: r.role,
        })),
      );
    }, currentUser.userId);
  });

  // GET /workspace - Active workspace summary
  fastify.get("/workspace", { preHandler: requireAuth }, async (request, reply) => {
    const currentUser = request.currentUser!;
    return withTenant(currentUser.tenantId, async (client) => {
      const result = await client.query<{
        tenant_id: string;
        name: string;
        slug: string;
        plan: string;
        member_count: string;
      }>(
        `SELECT t.tenant_id, t.name, t.slug, t.plan,
                (SELECT count(*) FROM app.workspace_memberships m WHERE m.workspace_id = t.tenant_id) AS member_count
         FROM app.tenants t WHERE t.tenant_id = $1`,
        [currentUser.tenantId],
      );
      const row = result.rows[0];
      if (!row) {
        return reply.code(404).send({ detail: "Workspace not found" });
      }
      return reply.send({
        id: row.tenant_id,
        name: row.name,
        slug: row.slug,
        plan: displayPlan(row.plan),
        memberCount: Math.max(1, Number(row.member_count)),
      });
    }, currentUser.userId);
  });

  // POST /workspaces - Create a brand new workspace
  fastify.post("/workspaces", { preHandler: requireAuth }, async (request, reply) => {
    const currentUser = request.currentUser!;
    const body = request.body as { name?: string };
    if (!body?.name || !body.name.trim()) {
      return reply.code(422).send({ detail: "Workspace name is required" });
    }

    const trimmedName = body.name.trim();

    return withTenant(currentUser.tenantId, async (client) => {
      const tenantResult = await client.query<{ tenant_id: string; slug: string }>(
        "INSERT INTO app.tenants (name) VALUES ($1) RETURNING tenant_id, slug",
        [trimmedName],
      );
      const newTenant = tenantResult.rows[0];
      const newTenantId = newTenant.tenant_id;

      // Set the session's active tenant to the newly created tenant so RLS WITH CHECK passes
      await client.query(
        "SELECT set_config('app.current_tenant', $1, true)",
        [newTenantId],
      );
      await client.query(
        "SELECT set_config('app.current_user_id', $1, true)",
        [currentUser.userId],
      );

      await client.query(
        `INSERT INTO app.workspace_memberships (user_id, workspace_id, role)
         VALUES ($1, $2, 'owner')`,
        [currentUser.userId, newTenantId],
      );

      const token = createAccessToken(currentUser.userId, newTenantId, "owner");

      return reply.code(201).send({
        access_token: token,
        token_type: "bearer",
        workspace: {
          id: newTenantId,
          name: trimmedName,
          slug: newTenant.slug,
          plan: "starter",
          memberCount: 1,
        },
      });
    }, currentUser.userId);
  });

  // POST /workspaces/:workspaceId/switch - Switch session to another workspace
  fastify.post("/workspaces/:workspaceId/switch", { preHandler: requireAuth }, async (request, reply) => {
    const currentUser = request.currentUser!;
    const { workspaceId } = request.params as { workspaceId: string };

    return withTenant(currentUser.tenantId, async (client) => {
      const memResult = await client.query<{ role: string }>(
        "SELECT role FROM app.workspace_memberships WHERE user_id = $1 AND workspace_id = $2",
        [currentUser.userId, workspaceId],
      );
      const membership = memResult.rows[0];
      if (!membership) {
        return reply.code(403).send({ detail: "Not a member of that workspace" });
      }

      const tenantResult = await client.query<{
        tenant_id: string;
        name: string;
        slug: string;
        plan: string;
        member_count: string;
      }>(
        `SELECT t.tenant_id, t.name, t.slug, t.plan,
                (SELECT count(*) FROM app.workspace_memberships m WHERE m.workspace_id = t.tenant_id) AS member_count
         FROM app.tenants t WHERE t.tenant_id = $1`,
        [workspaceId],
      );
      const row = tenantResult.rows[0];
      if (!row) {
        return reply.code(404).send({ detail: "Workspace not found" });
      }

      const token = createAccessToken(currentUser.userId, workspaceId, membership.role);

      return reply.send({
        access_token: token,
        token_type: "bearer",
        workspace: {
          id: row.tenant_id,
          name: row.name,
          slug: row.slug,
          plan: displayPlan(row.plan),
          memberCount: Math.max(1, Number(row.member_count)),
        },
      });
    }, currentUser.userId);
  });
}
