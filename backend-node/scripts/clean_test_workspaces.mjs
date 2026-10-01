import pg from "pg";

const pool = new pg.Pool({
  host: "localhost",
  port: 5432,
  database: "apicem",
  user: "apicem",
  password: "Root123",
});

async function main() {
  // Keep active workspace '32826120-e807-4137-82b9-61381279f992' (Aayush)
  // Delete leftover test tenants
  const leftoverTenants = [
    "9252d9cc-9c17-4ed7-a3d0-baf7bd629c07",
    "e129a8e9-33f1-4111-a5a1-c2cca44a1b86",
    "cf284f4c-eb48-4e28-a519-77f39b38ff16",
    "be646762-426a-41a2-b36d-61152e1851c2",
  ];
  for (const tid of leftoverTenants) {
    await pool.query("DELETE FROM app.tenants WHERE tenant_id = $1", [tid]);
  }
  console.log("Cleaned up temporary test workspaces");

  const remaining = await pool.query(
    "SELECT t.tenant_id, t.name, m.role FROM app.workspace_memberships m JOIN app.tenants t ON t.tenant_id = m.workspace_id WHERE m.user_id = '0c1244b4-27f3-4574-ae1e-0be185affeb2'",
  );
  console.log("Current user workspaces:", remaining.rows);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
