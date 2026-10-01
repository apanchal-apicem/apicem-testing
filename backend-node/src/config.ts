// Mirrors backend/app/config.py's Settings shape exactly -- same env var names, same
// blank-means-disabled convention for FERNET_KEY/SMTP_HOST/GROQ_API_KEY, same repo-root .env
// resolution (this file lives two levels deep, at backend-node/src/, one level deeper than
// the Python backend/app/ -- adjust accordingly below).
import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT_ENV = path.join(__dirname, "..", "..", ".env");
loadDotenv({ path: REPO_ROOT_ENV, override: true });

function env(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

export const settings = {
  postgresHost: env("POSTGRES_HOST", "postgres"),
  postgresPort: envInt("POSTGRES_PORT", 5432),
  postgresDb: env("POSTGRES_DB", "apicem"),

  // The backend connects ONLY as the restricted apicem_app role -- never as the table owner --
  // so Postgres always subjects it to RLS (doc Sec 6.2, 11).
  apicemAppDbUser: env("APICEM_APP_DB_USER", "apicem_app"),
  apicemAppDbPassword: env("APICEM_APP_DB_PASSWORD", "apicem_app_dev_password"),

  jwtSecret: env("JWT_SECRET", "change_me_dev_only"),
  jwtAlgorithm: "HS256" as const,
  jwtExpiresMinutes: 60 * 24,

  cookieSecure: env("COOKIE_SECURE", "false") === "true",

  // Used to envelope-encrypt connection credentials before they're stored in app.secrets
  // (doc Sec 2.2, 11). Real deployments should use AWS Secrets Manager/Vault instead.
  fernetKey: env("FERNET_KEY", ""),

  passwordResetTokenExpiresMinutes: 30,

  // /auth/demo issues a real token for this fixed, pre-seeded account with no credentials
  // required -- the "View live demo" button on the public homepage. Its role is always
  // "viewer" (see warehouse seeding), so requireRole("owner","admin") already blocks it from
  // touching connections/team/workspace settings -- no separate read-only mode needed.
  demoUserEmail: env("DEMO_USER_EMAIL", "demo@apicem-demo.com"),

  // Blank host = log the email to the backend's own console instead of sending (dev
  // fallback -- see .env.example). Fill in once a real provider is configured.
  smtpHost: env("SMTP_HOST", ""),
  smtpPort: envInt("SMTP_PORT", 587),
  smtpUsername: env("SMTP_USERNAME", ""),
  smtpPassword: env("SMTP_PASSWORD", ""),
  smtpFromEmail: env("SMTP_FROM_EMAIL", "onboarding@apicem.local"),

  // Blank = the Groq last-resort intent classifier is entirely disabled -- no outbound call is
  // ever attempted. It only ever CLASSIFIES a question into one of this app's own
  // already-defined metric/date keys (validated against them before use); it never sees or
  // states a number, so keeping this optional doesn't weaken the "no LLM ever answers
  // directly" guarantee the rest of the assistant relies on.
  groqApiKey: env("GROQ_API_KEY", ""),
  groqModel: env("GROQ_MODEL", "openai/gpt-oss-20b"),
};
