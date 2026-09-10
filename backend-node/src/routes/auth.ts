// Ports backend/app/routers/auth.py route-for-route, same paths/status codes/error
// messages/response shapes (snake_case JSON fields preserved exactly -- the frontend's
// client.ts contract must not need to change).
import type { FastifyInstance } from "fastify";

import { settings } from "../config.js";
import { withTenant, withTransaction } from "../db.js";
import { sendEmail } from "../email.js";
import { rateLimit } from "../rateLimit.js";
import {
  InvalidResetLinkError,
  createAccessToken,
  createPasswordResetToken,
  hashPassword,
  requireAuth,
  verifyPassword,
  verifyPasswordResetToken,
} from "../security.js";

interface LoginLookupRow {
  user_id: string;
  tenant_id: string;
  hashed_password: string;
  role: string;
}

async function loginLookup(client: import("pg").PoolClient, email: string): Promise<LoginLookupRow | null> {
  const result = await client.query<LoginLookupRow>("SELECT * FROM app.login_lookup($1)", [email]);
  return result.rows[0] ?? null;
}

export default async function authRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    "/auth/signup",
    { preHandler: rateLimit(5, 60) },
    async (request, reply) => {
      const body = request.body as { company_name?: string; email?: string; password?: string };
      if (!body.company_name || !body.email || !body.password) {
        return reply.code(422).send({ detail: "company_name, email, and password are required" });
      }

      return withTransaction(async (client) => {
        const existing = await loginLookup(client, body.email!);
        if (existing) {
          return reply.code(409).send({ detail: "Email already registered" });
        }

        const tenantResult = await client.query<{ tenant_id: string }>(
          "INSERT INTO app.tenants (name) VALUES ($1) RETURNING tenant_id",
          [body.company_name],
        );
        const tenantId = tenantResult.rows[0].tenant_id;

        // The RLS session variable must be set to the tenant we just created, in the same
        // transaction, before the first insert into a tenant-scoped table (app.users) --
        // otherwise the RLS WITH CHECK clause rejects the insert (doc Sec 6.2).
        await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
        const userResult = await client.query<{ user_id: string; role: string }>(
          `INSERT INTO app.users (tenant_id, email, hashed_password, role)
           VALUES ($1, $2, $3, 'owner')
           RETURNING user_id, role`,
          [tenantId, body.email, await hashPassword(body.password!)],
        );
        const user = userResult.rows[0];

        const token = createAccessToken(user.user_id, tenantId, user.role);
        return reply.send({ access_token: token, token_type: "bearer" });
      });
    },
  );

  fastify.post(
    "/auth/login",
    { preHandler: rateLimit(5, 60) },
    async (request, reply) => {
      const body = request.body as { email?: string; password?: string };
      if (!body.email || !body.password) {
        return reply.code(422).send({ detail: "email and password are required" });
      }

      return withTransaction(async (client) => {
        const row = await loginLookup(client, body.email!);
        if (!row || !(await verifyPassword(body.password!, row.hashed_password))) {
          return reply.code(401).send({ detail: "Invalid email or password" });
        }
        const token = createAccessToken(row.user_id, row.tenant_id, row.role);
        return reply.send({ access_token: token, token_type: "bearer" });
      });
    },
  );

  fastify.post(
    "/auth/demo",
    { preHandler: rateLimit(20, 60) },
    async (_request, reply) => {
      return withTransaction(async (client) => {
        const row = await loginLookup(client, settings.demoUserEmail);
        if (!row) {
          return reply.code(503).send({ detail: "The live demo isn't set up on this server yet." });
        }
        const token = createAccessToken(row.user_id, row.tenant_id, row.role, true);
        return reply.send({ access_token: token, token_type: "bearer" });
      });
    },
  );

  fastify.get("/auth/me", { preHandler: requireAuth }, async (request, reply) => {
    const currentUser = request.currentUser!;
    return withTenant(currentUser.tenantId, async (client) => {
      const result = await client.query<{ email: string; role: string; tenant_name: string; tenant_logo_url: string | null }>(
        `SELECT u.email, u.role, t.name AS tenant_name, t.logo_url AS tenant_logo_url
         FROM app.users u JOIN app.tenants t ON t.tenant_id = u.tenant_id
         WHERE u.user_id = $1`,
        [currentUser.userId],
      );
      const row = result.rows[0];
      return reply.send({
        user_id: currentUser.userId,
        tenant_id: currentUser.tenantId,
        email: row.email,
        role: row.role,
        tenant_name: row.tenant_name,
        tenant_logo_url: row.tenant_logo_url,
        is_demo: currentUser.isDemo,
      });
    });
  });

  fastify.post("/auth/change-password", { preHandler: requireAuth }, async (request, reply) => {
    const currentUser = request.currentUser!;
    const body = request.body as { current_password?: string; new_password?: string };
    if (!body.current_password || !body.new_password) {
      return reply.code(422).send({ detail: "current_password and new_password are required" });
    }

    return withTenant(currentUser.tenantId, async (client) => {
      const result = await client.query<{ hashed_password: string }>(
        "SELECT hashed_password FROM app.users WHERE user_id = $1",
        [currentUser.userId],
      );
      const row = result.rows[0];
      if (!(await verifyPassword(body.current_password!, row.hashed_password))) {
        return reply.code(400).send({ detail: "Current password is incorrect" });
      }
      await client.query("UPDATE app.users SET hashed_password = $1 WHERE user_id = $2", [
        await hashPassword(body.new_password!),
        currentUser.userId,
      ]);
      return reply.code(204).send();
    });
  });

  fastify.post(
    "/auth/request-password-reset",
    { preHandler: rateLimit(3, 300) },
    async (request, reply) => {
      const body = request.body as { email?: string };
      if (!body.email) {
        return reply.code(422).send({ detail: "email is required" });
      }

      // Always return 202 regardless of whether the email exists -- a differing response
      // would let an attacker enumerate registered emails through this endpoint.
      await withTransaction(async (client) => {
        const row = await loginLookup(client, body.email!);
        if (row) {
          const resetToken = createPasswordResetToken(row.user_id);
          const resetLink = `http://localhost:5173/reset-password?token=${resetToken}`;
          await sendEmail(
            body.email!,
            "Reset your Apicem Engine password",
            `Click the link below to reset your password. This link expires in 30 minutes.\n\n${resetLink}`,
          );
        }
      });
      return reply.code(202).send({ status: "if that email is registered, a reset link has been sent" });
    },
  );

  fastify.post("/auth/reset-password", async (request, reply) => {
    const body = request.body as { token?: string; new_password?: string };
    if (!body.token || !body.new_password) {
      return reply.code(422).send({ detail: "token and new_password are required" });
    }

    let userId: string;
    try {
      userId = verifyPasswordResetToken(body.token);
    } catch (err) {
      if (err instanceof InvalidResetLinkError) {
        return reply.code(400).send({ detail: "Invalid or expired reset link" });
      }
      throw err;
    }

    return withTransaction(async (client) => {
      const result = await client.query(
        "SELECT * FROM app.reset_password($1, $2)",
        [userId, await hashPassword(body.new_password!)],
      );
      if (result.rows.length === 0) {
        return reply.code(404).send({ detail: "Account not found" });
      }
      return reply.code(204).send();
    });
  });
}
