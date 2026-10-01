// Ports backend/app/main.py: same CORS origin regex (LAN-only by design -- public IPs
// deliberately never match), same /health check, same /uploads static mount (pointed at the
// same physical directory tenant.ts's LOGO_DIR uses), same global error handler shape.
import path from "node:path";
import { fileURLToPath } from "node:url";

import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import staticPlugin from "@fastify/static";
import Fastify from "fastify";

import assistantRoutes from "./routes/assistant.js";
import authRoutes from "./routes/auth.js";
import connectionsRoutes from "./routes/connections.js";
import dashboardsRoutes from "./routes/dashboards.js";
import metricsRoutes from "./routes/metrics.js";
import teamRoutes from "./routes/team.js";
import tenantRoutes, { LOGO_DIR } from "./routes/tenant.js";
import workspaceRoutes from "./routes/workspace.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Matches localhost/127.0.0.1 or any RFC1918 private IP on port 5173 (old frontend) or 5174/5175 (new frontend)
const CORS_ORIGIN_REGEX =
  /^http:\/\/(localhost|127\.0\.0\.1|10(\.\d{1,3}){3}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2}|192\.168(\.\d{1,3}){2}):(5173|5174|5175)$/;

export function buildApp() {
  const app = Fastify({ logger: false });

  app.register(cookie);

  app.register(cors, {
    origin: (origin, callback) => {
      // No Origin header (e.g. curl, server-to-server) -- allow, matching FastAPI's
      // CORSMiddleware default behavior of only inspecting the header when present.
      if (!origin || CORS_ORIGIN_REGEX.test(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });

  app.register(multipart);

  // LOGO_DIR is .../backend/uploads/logos -- one level up is .../backend/uploads, the
  // directory main.py's static mount actually serves at the /uploads/ prefix.
  const uploadsRoot = path.join(LOGO_DIR, "..");
  app.register(staticPlugin, {
    root: uploadsRoot,
    prefix: "/uploads/",
  });

  app.get("/health", async () => ({ status: "ok" }));

  // Legacy routes
  app.register(authRoutes);
  app.register(teamRoutes);
  app.register(tenantRoutes);
  app.register(connectionsRoutes);
  app.register(metricsRoutes);
  app.register(dashboardsRoutes);
  app.register(assistantRoutes);
  app.register(workspaceRoutes);

  app.setErrorHandler((error: any, _request, reply) => {
    console.error("[FASTIFY_ERROR]", error?.name, error?.message, error?.stack);
    reply
      .code(error?.statusCode ?? 500)
      .send({ detail: error?.message || "Internal server error" });
  });

  return app;
}

// import.meta.url is a URL-encoded file:// URL with forward slashes; process.argv[1] is a
// raw OS path (backslashes on Windows) -- comparing them as strings directly silently never
// matches on Windows, so app.listen() would just never run with no error at all. Resolving
// both through the same path representation before comparing fixes that.
const isMainModule =
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "");
if (isMainModule) {
  const app = buildApp();
  const port = Number(process.env.PORT ?? 8000);
  app.listen({ host: "0.0.0.0", port }, (err, address) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log(`apicem-backend (node) listening on ${address}`);
  });
}
