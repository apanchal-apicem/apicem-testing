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

async function loginLookup(
  client: import("pg").PoolClient,
  email: string,
): Promise<LoginLookupRow | null> {
  const result = await client.query<LoginLookupRow>(
    "SELECT * FROM app.login_lookup($1)",
    [email],
  );
  return result.rows[0] ?? null;
}

export default async function authRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  fastify.post(
    "/auth/signup",
    { preHandler: rateLimit(5, 60) },
    async (request, reply) => {
      const body = request.body as {
        company_name?: string;
        email?: string;
        password?: string;
      };
      if (!body.company_name || !body.email || !body.password) {
        return reply
          .code(422)
          .send({ detail: "company_name, email, and password are required" });
      }

      const res = await withTransaction(async (client) => {
        const existing = await loginLookup(client, body.email!);
        if (existing) {
          return { status: 409, detail: "Email already registered" };
        }

        const tenantResult = await client.query<{ tenant_id: string }>(
          "INSERT INTO app.tenants (name) VALUES ($1) RETURNING tenant_id",
          [body.company_name],
        );
        const tenantId = tenantResult.rows[0].tenant_id;

        await client.query(
          "SELECT set_config('app.current_tenant', $1, true)",
          [tenantId],
        );
        const bodyName = (body as { name?: string }).name?.trim() || null;
        const userResult = await client.query<{
          user_id: string;
          role: string;
        }>(
          `INSERT INTO app.users (tenant_id, email, hashed_password, role, name)
           VALUES ($1, $2, $3, 'owner', $4)
           RETURNING user_id, role`,
          [tenantId, body.email, await hashPassword(body.password!), bodyName],
        );
        const user = userResult.rows[0];

        const token = createAccessToken(user.user_id, tenantId, user.role);
        return { status: 200, access_token: token, token_type: "bearer" };
      });

      if (res.status === 409) {
        return reply.code(409).send({ detail: res.detail });
      }
      return reply.send({ access_token: res.access_token, token_type: res.token_type });
    },
  );

  fastify.post(
    "/auth/login",
    { preHandler: rateLimit(5, 60) },
    async (request, reply) => {
      const body = request.body as { email?: string; password?: string };
      if (!body.email || !body.password) {
        return reply
          .code(422)
          .send({ detail: "email and password are required" });
      }

      const res = await withTransaction(async (client) => {
        const row = await loginLookup(client, body.email!);
        if (!row) {
          return { status: 401, detail: "Invalid email or password" };
        }
        const pwMatch = await verifyPassword(body.password!, row.hashed_password);
        if (!pwMatch) {
          return { status: 401, detail: "Invalid email or password" };
        }
        const token = createAccessToken(row.user_id, row.tenant_id, row.role);
        return { status: 200, access_token: token, token_type: "bearer" };
      });

      if (res.status === 401) {
        return reply.code(401).send({ detail: res.detail });
      }
      return reply.send({ access_token: res.access_token, token_type: res.token_type });
    },
  );

  fastify.post(
    "/auth/demo",
    { preHandler: rateLimit(20, 60) },
    async (_request, reply) => {
      const res = await withTransaction(async (client) => {
        const row = await loginLookup(client, settings.demoUserEmail);
        if (!row) {
          return { status: 503, detail: "The live demo isn't set up on this server yet." };
        }
        const token = createAccessToken(
          row.user_id,
          row.tenant_id,
          row.role,
          true,
        );
        return { status: 200, access_token: token, token_type: "bearer" };
      });

      if (res.status === 503) {
        return reply.code(503).send({ detail: res.detail });
      }
      return reply.send({ access_token: res.access_token, token_type: res.token_type });
    },
  );

  fastify.post("/auth/logout", async (_request, reply) => {
    reply.clearCookie("apicem_jwt", { path: "/" });
    return reply.code(204).send();
  });

  fastify.get(
    "/auth/me",
    { preHandler: requireAuth },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const row = await withTenant(currentUser.tenantId, async (client) => {
        const result = await client.query<{
          email: string;
          role: string;
          name: string | null;
          tenant_name: string;
          tenant_logo_url: string | null;
        }>(
          `SELECT u.email, u.role, u.name, t.name AS tenant_name, t.logo_url AS tenant_logo_url
         FROM app.users u JOIN app.tenants t ON t.tenant_id = u.tenant_id
         WHERE u.user_id = $1`,
          [currentUser.userId],
        );
        return result.rows[0] ?? null;
      }, currentUser.userId);

      if (!row) {
        return reply.code(404).send({ detail: "User not found" });
      }
      return reply.send({
        user_id: currentUser.userId,
        tenant_id: currentUser.tenantId,
        email: row.email,
        name: row.name,
        role: row.role,
        tenant_name: row.tenant_name,
        tenant_logo_url: row.tenant_logo_url,
        is_demo: currentUser.isDemo,
      });
    },
  );

  fastify.patch(
    "/auth/me",
    { preHandler: requireAuth },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const body = request.body as { name?: string };
      const name = (body?.name ?? "").trim();
      if (!name) {
        return reply.code(400).send({ detail: "Name cannot be empty" });
      }
      if (name.length > 80) {
        return reply.code(400).send({ detail: "Name cannot exceed 80 characters" });
      }

      await withTenant(currentUser.tenantId, async (client) => {
        await client.query(
          "UPDATE app.users SET name = $1 WHERE user_id = $2",
          [name, currentUser.userId],
        );
      }, currentUser.userId);

      return reply.code(200).send({ name });
    },
  );

  fastify.post(
    "/auth/change-password",
    { preHandler: requireAuth },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const body = request.body as {
        current_password?: string;
        new_password?: string;
      };
      if (!body.current_password || !body.new_password) {
        return reply
          .code(422)
          .send({ detail: "current_password and new_password are required" });
      }
      if (body.new_password.length < 8) {
        return reply.code(422).send({ detail: "Password must be at least 8 characters long" });
      }

      const res = await withTenant(currentUser.tenantId, async (client) => {
        const result = await client.query<{ hashed_password: string }>(
          "SELECT hashed_password FROM app.users WHERE user_id = $1",
          [currentUser.userId],
        );
        const row = result.rows[0];
        if (!row) {
          return { status: 404, detail: "User not found" };
        }
        if (
          !(await verifyPassword(body.current_password!, row.hashed_password))
        ) {
          return { status: 400, detail: "Current password is incorrect" };
        }
        await client.query(
          "UPDATE app.users SET hashed_password = $1 WHERE user_id = $2",
          [await hashPassword(body.new_password!), currentUser.userId],
        );
        return { status: 204 };
      }, currentUser.userId);

      if (res.status === 404 || res.status === 400) {
        return reply.code(res.status).send({ detail: res.detail });
      }
      return reply.code(204).send();
    },
  );

  fastify.post(
    "/auth/request-password-reset",
    { preHandler: rateLimit(3, 300) },
    async (request, reply) => {
      const body = request.body as { email?: string };
      if (!body.email) {
        return reply.code(422).send({ detail: "email is required" });
      }

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
      return reply.code(202).send({
        status: "if that email is registered, a reset link has been sent",
      });
    },
  );

  fastify.post("/auth/reset-password", async (request, reply) => {
    const body = request.body as { token?: string; new_password?: string };
    if (!body.token || !body.new_password) {
      return reply
        .code(422)
        .send({ detail: "token and new_password are required" });
    }
    if (body.new_password.length < 8) {
      return reply.code(422).send({ detail: "Password must be at least 8 characters long" });
    }

    let userId: string;
    try {
      userId = verifyPasswordResetToken(body.token);
    } catch (err) {
      if (err instanceof InvalidResetLinkError) {
        return reply
          .code(400)
          .send({ detail: "Invalid or expired reset link" });
      }
      throw err;
    }

    const res = await withTransaction(async (client) => {
      const result = await client.query(
        "SELECT * FROM app.reset_password($1, $2)",
        [userId, await hashPassword(body.new_password!)],
      );
      if (result.rows.length === 0) {
        return { status: 404, detail: "Account not found" };
      }
      return { status: 204 };
    });

    if (res.status === 404) {
      return reply.code(404).send({ detail: res.detail });
    }
    return reply.code(204).send();
  });
}
