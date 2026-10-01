import pg from "pg";

const pool = new pg.Pool({
  host: "localhost",
  port: 5432,
  database: "apicem",
  user: "apicem",
  password: "Root123",
});

async function main() {
  await pool.query("UPDATE app.tenants SET name = $1 WHERE tenant_id = $2", [
    "Aayush",
    "32826120-e807-4137-82b9-61381279f992",
  ]);
  console.log("Restored workspace name to Aayush");

  const users = await pool.query("SELECT user_id, tenant_id, role FROM app.users");
  for (const u of users.rows) {
    await pool.query(
      `INSERT INTO app.workspace_memberships (user_id, workspace_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, workspace_id) DO UPDATE SET role = EXCLUDED.role`,
      [u.user_id, u.tenant_id, u.role],
    );
  }
  console.log("Synchronized workspace memberships");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
