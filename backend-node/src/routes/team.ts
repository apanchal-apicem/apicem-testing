// Ports backend/app/routers/team.py exactly, including the ROLE_RANK-based grant/removal
// guards (the "actual bug fix" comment in the Python source: any admin could previously
// remove any owner, since the old check only asked "owner or admin", never who outranks whom).
import type { FastifyInstance } from "fastify";

import { withTenant } from "../db.js";
import { ROLE_RANK, hashPassword, requireAuth, requireRole } from "../security.js";

const VALID_ROLES = new Set(["owner", "admin", "editor", "viewer"]);

export default async function teamRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/team", { preHandler: requireAuth }, async (request, reply) => {
    const currentUser = request.currentUser!;
    const rows = await withTenant(currentUser.tenantId, async (client) => {
      const result = await client.query(
        "SELECT user_id, email, name, role, created_at FROM app.users ORDER BY created_at",
      );
      return result.rows;
    }, currentUser.userId);
    return reply.send(rows);
  });

  fastify.post(
    "/team",
    { preHandler: [requireAuth, requireRole("owner", "admin")] },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const body = request.body as { email?: string; password?: string; role?: string };
      if (!body.email || !body.password) {
        return reply.code(422).send({ detail: "email and password are required" });
      }
      if (body.password.length < 8) {
        return reply.code(422).send({ detail: "Password must be at least 8 characters long" });
      }
      const role = body.role ?? "viewer";
      if (!VALID_ROLES.has(role)) {
        return reply.code(400).send({ detail: `role must be one of ${JSON.stringify([...VALID_ROLES].sort())}` });
      }
      // An admin could otherwise grant themselves an ally the owner role and escape the
      // hierarchy entirely -- you can only grant a role at or below your own rank.
      if (ROLE_RANK[role] > ROLE_RANK[currentUser.role]) {
        return reply.code(403).send({ detail: `Your role (${currentUser.role}) cannot grant the ${role} role` });
      }

      const res = await withTenant(currentUser.tenantId, async (client) => {
        const existing = await client.query("SELECT 1 FROM app.login_lookup($1)", [body.email]);
        if (existing.rows.length > 0) {
          return { status: 409, detail: "Email already registered" };
        }
        const result = await client.query(
          `INSERT INTO app.users (tenant_id, email, hashed_password, role)
           VALUES ($1, $2, $3, $4)
           RETURNING user_id, email, role, created_at`,
          [currentUser.tenantId, body.email, await hashPassword(body.password!), role],
        );
        const newUser = result.rows[0];
        await client.query(
          `INSERT INTO app.workspace_memberships (user_id, workspace_id, role)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, workspace_id) DO UPDATE SET role = EXCLUDED.role`,
          [newUser.user_id, currentUser.tenantId, role],
        );
        return { status: 201, user: newUser };
      }, currentUser.userId);

      if (res.status === 409) {
        return reply.code(409).send({ detail: res.detail });
      }
      return reply.code(201).send(res.user);
    },
  );

  fastify.delete(
    "/team/:userId",
    { preHandler: [requireAuth, requireRole("owner", "admin")] },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const { userId } = request.params as { userId: string };
      if (userId === currentUser.userId) {
        return reply.code(400).send({ detail: "Cannot remove your own account" });
      }

      const res = await withTenant(currentUser.tenantId, async (client) => {
        const targetResult = await client.query<{ role: string }>(
          "SELECT role FROM app.users WHERE user_id = $1",
          [userId],
        );
        const target = targetResult.rows[0];
        if (!target) {
          return { status: 404, detail: "Teammate not found" };
        }

        // Same rank comparison as add_teammate -- you can only remove someone at or below
        // your own rank, so admin can remove admin/viewer but never owner.
        if (ROLE_RANK[target.role] > ROLE_RANK[currentUser.role]) {
          return { status: 403, detail: "Cannot remove a teammate with a higher role than your own" };
        }

        if (target.role === "owner") {
          const countResult = await client.query<{ count: string }>(
            "SELECT count(*) FROM app.users WHERE role = 'owner'",
          );
          if (Number(countResult.rows[0].count) <= 1) {
            return { status: 400, detail: "Cannot remove the last owner" };
          }
        }

        await client.query("DELETE FROM app.users WHERE user_id = $1", [userId]);
        return { status: 204 };
      }, currentUser.userId);

      if (res.status === 404 || res.status === 403 || res.status === 400) {
        return reply.code(res.status).send({ detail: res.detail });
      }
      return reply.code(204).send();
    },
  );

  fastify.patch(
    "/team/:userId",
    { preHandler: [requireAuth, requireRole("owner", "admin")] },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const { userId } = request.params as { userId: string };
      const body = request.body as { role?: string };
      const role = body.role;
      if (!role || !VALID_ROLES.has(role)) {
        return reply.code(400).send({ detail: `role must be one of ${JSON.stringify([...VALID_ROLES].sort())}` });
      }
      if (ROLE_RANK[role] > ROLE_RANK[currentUser.role]) {
        return reply.code(403).send({ detail: `Your role (${currentUser.role}) cannot grant the ${role} role` });
      }

      return withTenant(currentUser.tenantId, async (client) => {
        const targetResult = await client.query<{ role: string }>(
          "SELECT role FROM app.users WHERE user_id = $1",
          [userId],
        );
        const target = targetResult.rows[0];
        if (!target) {
          return reply.code(404).send({ detail: "Teammate not found" });
        }
        if (ROLE_RANK[target.role] > ROLE_RANK[currentUser.role]) {
          return reply.code(403).send({ detail: "Cannot modify a teammate with a higher role than your own" });
        }
        await client.query("UPDATE app.users SET role = $1 WHERE user_id = $2", [role, userId]);
        await client.query(
          `INSERT INTO app.workspace_memberships (user_id, workspace_id, role)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, workspace_id) DO UPDATE SET role = EXCLUDED.role`,
          [userId, currentUser.tenantId, role],
        );
        return reply.code(204).send();
      }, currentUser.userId);
    },
  );
}
