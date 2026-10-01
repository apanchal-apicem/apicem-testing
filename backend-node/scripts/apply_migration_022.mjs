import pg from "pg";

const pool = new pg.Pool({
  host: "localhost",
  port: 5432,
  database: "apicem",
  user: "apicem",
  password: "Root123",
});

async function main() {
  await pool.query("ALTER TABLE app.users DROP CONSTRAINT IF EXISTS users_role_check");
  await pool.query("ALTER TABLE app.users ADD CONSTRAINT users_role_check CHECK (role IN ('owner', 'admin', 'editor', 'viewer'))");
  console.log("Successfully updated app.users users_role_check constraint to include ('owner', 'admin', 'editor', 'viewer')");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
