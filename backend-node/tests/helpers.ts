// Mirrors backend/tests/conftest.py's fixtures one-for-one: real local Postgres (not mocks --
// this app's riskiest bugs have all been in RLS/grants/SQL, which a mocked DB layer would
// never catch), disposable tagged tenants, an owner-role connection for RLS-bypassing
// teardown/assertions.
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config as loadDotenv } from "dotenv";
import pg from "pg";
import request from "supertest";

import { buildApp } from "../src/main.js";
import { reset as resetRateLimit } from "../src/rateLimit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT_ENV = path.join(__dirname, "..", "..", ".env");
loadDotenv({ path: REPO_ROOT_ENV });

export const TEST_EMAIL_MARKER = "apicem-vitest";

// Fastify registers plugins (cors/multipart/static) asynchronously -- supertest hitting
// app.server before app.ready() resolves can hang indefinitely on the very first request
// instead of erroring, since the route table isn't populated yet. Top-level await (this file
// is ESM) means every test file's import of `api` waits for this exactly once.
export const app = buildApp();
await app.ready();
export const api = request(app.server);

function randomSuffix(): string {
  return randomBytes(6).toString("hex");
}

export interface SignupPayload {
  company_name: string;
  email: string;
  password: string;
}

export function signupPayload(): SignupPayload {
  const suffix = randomSuffix();
  return {
    company_name: `${TEST_EMAIL_MARKER}-${suffix}`,
    email: `${TEST_EMAIL_MARKER}-${suffix}@example.com`,
    password: "testpassword123",
  };
}

// Direct connection as the table-owner role, for teardown/assertions that must bypass RLS --
// reads POSTGRES_USER/PASSWORD from the environment directly (not settings.ts, which only
// models the backend's own restricted apicem_app credentials), same as conftest.py's
// owner_db_conn fixture.
export const ownerPool = new pg.Pool({
  host: process.env.POSTGRES_HOST ?? "localhost",
  port: Number(process.env.POSTGRES_PORT ?? 5432),
  database: process.env.POSTGRES_DB ?? "apicem",
  user: process.env.POSTGRES_USER ?? "apicem",
  password: process.env.POSTGRES_PASSWORD ?? "apicem_dev_password",
});

export interface SignedUpTenant extends SignupPayload {
  token: string;
}

export async function signUp(payload: SignupPayload = signupPayload()): Promise<SignedUpTenant> {
  resetRateLimit();
  const response = await api.post("/auth/signup").send(payload);
  if (response.status !== 200) {
    throw new Error(`signup failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return { token: response.body.access_token, ...payload };
}

export async function cleanupTenant(tenant: SignupPayload): Promise<void> {
  await ownerPool.query("DELETE FROM app.users WHERE email = $1", [tenant.email]);
  await ownerPool.query("DELETE FROM app.tenants WHERE name = $1", [tenant.company_name]);
}

export function authHeader(tenant: SignedUpTenant): { Authorization: string } {
  return { Authorization: `Bearer ${tenant.token}` };
}

/** Adds a second, viewer-role user to the SAME tenant `signedUp` created, and returns their
 * auth header -- for testing that RBAC actually blocks the UI actions it's meant to. */
export async function addViewer(owner: SignedUpTenant): Promise<{ Authorization: string }> {
  resetRateLimit();
  const viewerEmail = `viewer-${owner.email}`;
  const created = await api
    .post("/team")
    .set(authHeader(owner))
    .send({ email: viewerEmail, password: "viewerpassword123", role: "viewer" });
  if (created.status !== 201) {
    throw new Error(`add viewer failed: ${created.status} ${JSON.stringify(created.body)}`);
  }
  resetRateLimit();
  const login = await api.post("/auth/login").send({ email: viewerEmail, password: "viewerpassword123" });
  if (login.status !== 200) {
    throw new Error(`login viewer failed: ${login.status} ${JSON.stringify(login.body)}`);
  }
  return { Authorization: `Bearer ${login.body.access_token}` };
}

// Every test starts with a clean rate-limit slate -- supertest requests all share one
// synthetic client IP, so without this, unrelated tests running back-to-back would trip
// each other's rate limit (same reason Python's conftest.py autouse fixture exists).
export function resetRateLimitBetweenTests(beforeEachFn: (fn: () => void) => void): void {
  beforeEachFn(() => resetRateLimit());
}
