// Ports backend/app/security.py exactly: JWT issue/verify (same secret/algorithm/claim shapes
// so existing tokens keep validating across the cutover), bcrypt hashing (bcryptjs's $2a$
// output verifies fine against existing passlib $2b$ hashes -- confirmed live against a real
// Python-generated hash before writing this file), and the ROLE_RANK-based authorization
// helpers used by team.py's grant/removal guards.
import bcrypt from "bcryptjs";
import type { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";

import { settings } from "./config.js";

export interface CurrentUser {
  userId: string;
  tenantId: string;
  role: string;
  isDemo: boolean;
}

export const ROLE_RANK: Record<string, number> = {
  viewer: 1,
  editor: 1,
  admin: 2,
  owner: 3,
};

const BCRYPT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  hashed: string,
): Promise<boolean> {
  return bcrypt.compare(password, hashed);
}

interface AccessTokenPayload {
  sub: string;
  tenant_id: string;
  role: string;
  is_demo: boolean;
}

export function createAccessToken(
  userId: string,
  tenantId: string,
  role: string,
  isDemo = false,
): string {
  const payload: AccessTokenPayload = {
    sub: userId,
    tenant_id: tenantId,
    role,
    is_demo: isDemo,
  };
  return jwt.sign(payload, settings.jwtSecret, {
    algorithm: settings.jwtAlgorithm,
    expiresIn: `${settings.jwtExpiresMinutes}m`,
  });
}

interface PasswordResetTokenPayload {
  sub: string;
  purpose: "password_reset";
}

export function createPasswordResetToken(userId: string): string {
  const payload: PasswordResetTokenPayload = {
    sub: userId,
    purpose: "password_reset",
  };
  return jwt.sign(payload, settings.jwtSecret, {
    algorithm: settings.jwtAlgorithm,
    expiresIn: `${settings.passwordResetTokenExpiresMinutes}m`,
  });
}

/** Thrown by verifyPasswordResetToken -- callers catch this specifically and translate it to
 * a 400, matching security.py's verify_password_reset_token raising HTTPException directly. */
export class InvalidResetLinkError extends Error {}

/** Returns the user_id, or throws InvalidResetLinkError if the token is invalid/expired/not
 * actually a reset token (wrong `purpose`, e.g. an access token used here by mistake). */
export function verifyPasswordResetToken(token: string): string {
  let decoded: unknown;
  try {
    decoded = jwt.verify(token, settings.jwtSecret, {
      algorithms: [settings.jwtAlgorithm],
    });
  } catch {
    throw new InvalidResetLinkError("Invalid or expired reset link");
  }
  if (typeof decoded !== "object" || decoded === null) {
    throw new InvalidResetLinkError("Invalid or expired reset link");
  }
  const payload = decoded as Record<string, unknown>;
  if (payload.purpose !== "password_reset" || typeof payload.sub !== "string") {
    throw new InvalidResetLinkError("Invalid or expired reset link");
  }
  return payload.sub;
}

export const SESSION_COOKIE_NAME = "apicem_session";

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE_NAME, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: settings.cookieSecure,
    maxAge: settings.jwtExpiresMinutes * 60,
  });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
}

declare module "fastify" {
  interface FastifyRequest {
    currentUser?: CurrentUser;
  }
}

/**
 * Fastify preHandler decoding the session cookie or bearer JWT.
 * Checks request.cookies.apicem_session first, falls back to Authorization: Bearer <token>.
 * Explicitly rejects a token missing tenant_id/role.
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const cookieToken = request.cookies?.[SESSION_COOKIE_NAME];
  let token = cookieToken;
  if (!token) {
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      token = authHeader.slice("Bearer ".length);
    }
  }

  if (!token) {
    reply.code(401).send({ detail: "Not authenticated" });
    return reply as never;
  }

  try {
    const decoded = jwt.verify(token, settings.jwtSecret, {
      algorithms: [settings.jwtAlgorithm],
    });
    if (typeof decoded !== "object" || decoded === null)
      throw new Error("malformed payload");
    const payload = decoded as Record<string, unknown>;
    if (
      typeof payload.sub !== "string" ||
      typeof payload.tenant_id !== "string" ||
      typeof payload.role !== "string"
    ) {
      reply.code(401).send({ detail: "Invalid or expired token" });
      return reply as never;
    }
    request.currentUser = {
      userId: payload.sub,
      tenantId: payload.tenant_id,
      role: payload.role,
      isDemo: Boolean(payload.is_demo),
    };
  } catch {
    reply.code(401).send({ detail: "Invalid or expired token" });
    return reply as never;
  }
}

/** Fastify preHandler factory: 403s if the current user's role isn't in `roles`. Must run
 * AFTER requireAuth (relies on request.currentUser being populated already). */
export function requireRole(...roles: string[]) {
  return async (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> => {
    if (!request.currentUser || !roles.includes(request.currentUser.role)) {
      reply.code(403).send({ detail: "Insufficient role" });
      return reply as never;
    }
  };
}
