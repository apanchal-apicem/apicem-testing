// Ports backend/app/routers/tenant.py exactly. LOGO_DIR deliberately points at the OLD
// Python backend's existing uploads/logos directory (shared physical storage) rather than a
// new one under backend-node/ -- existing tenant_logo_url values in the DB are mount-relative
// URLs ("/uploads/logos/<file>"), so whichever backend answers a request just needs to serve
// the SAME underlying files; there's no migration to do as long as both point at one directory.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

import type { FastifyInstance } from "fastify";

import { withTenant } from "../db.js";
import { requireAuth, requireRole } from "../security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const LOGO_DIR = path.join(__dirname, "..", "..", "..", "backend", "uploads", "logos");

const ALLOWED_LOGO_TYPES: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/svg+xml": ".svg",
  "image/webp": ".webp",
};
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

function existingLogoFiles(tenantId: string): string[] {
  if (!fs.existsSync(LOGO_DIR)) return [];
  return fs.readdirSync(LOGO_DIR).filter((f) => f.startsWith(`${tenantId}.`));
}

export default async function tenantRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.patch(
    "/tenant",
    { preHandler: [requireAuth, requireRole("owner", "admin")] },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const body = request.body as { name?: string };
      const name = (body.name ?? "").trim();
      if (!name) {
        return reply.code(400).send({ detail: "Workspace name can't be empty" });
      }
      return withTenant(currentUser.tenantId, async (client) => {
        await client.query("UPDATE app.tenants SET name = $1 WHERE tenant_id = $2", [name, currentUser.tenantId]);
        return reply.code(204).send();
      }, currentUser.userId);
    },
  );

  fastify.post(
    "/tenant/logo",
    { preHandler: [requireAuth, requireRole("owner", "admin")] },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      const file = await request.file({ limits: { fileSize: MAX_LOGO_BYTES + 1 } });
      if (!file) {
        return reply.code(400).send({ detail: "No file uploaded" });
      }
      if (!(file.mimetype in ALLOWED_LOGO_TYPES)) {
        return reply.code(400).send({
          detail: `Logo must be one of: ${Object.keys(ALLOWED_LOGO_TYPES).sort().join(", ")}`,
        });
      }
      const contents = await file.toBuffer();
      if (contents.length > MAX_LOGO_BYTES) {
        return reply.code(400).send({ detail: "Logo must be 2 MB or smaller" });
      }

      fs.mkdirSync(LOGO_DIR, { recursive: true });
      // Remove any previous logo for this tenant first -- re-uploading in a different format
      // (e.g. was .png, now .jpg) would otherwise leave the old file behind unreferenced.
      for (const existing of existingLogoFiles(currentUser.tenantId)) {
        fs.rmSync(path.join(LOGO_DIR, existing));
      }

      const extension = ALLOWED_LOGO_TYPES[file.mimetype];
      const filename = `${currentUser.tenantId}${extension}`;
      fs.writeFileSync(path.join(LOGO_DIR, filename), contents);

      // Cache-busted with a random suffix so the sidebar's <img> picks up the new file
      // immediately instead of showing a browser-cached copy of the old logo at the same URL.
      const logoUrl = `/uploads/logos/${filename}?v=${crypto.randomBytes(4).toString("hex")}`;
      return withTenant(currentUser.tenantId, async (client) => {
        await client.query("UPDATE app.tenants SET logo_url = $1 WHERE tenant_id = $2", [
          logoUrl,
          currentUser.tenantId,
        ]);
        return reply.code(204).send();
      }, currentUser.userId);
    },
  );

  fastify.delete(
    "/tenant/logo",
    { preHandler: [requireAuth, requireRole("owner", "admin")] },
    async (request, reply) => {
      const currentUser = request.currentUser!;
      for (const existing of existingLogoFiles(currentUser.tenantId)) {
        fs.rmSync(path.join(LOGO_DIR, existing));
      }
      return withTenant(currentUser.tenantId, async (client) => {
        await client.query("UPDATE app.tenants SET logo_url = NULL WHERE tenant_id = $1", [currentUser.tenantId]);
        return reply.code(204).send();
      }, currentUser.userId);
    },
  );
}
