import pg from "pg";

const pool = new pg.Pool({
  host: "localhost",
  user: "apicem_app",
  password: "Root123",
  database: "apicem",
});

async function main() {
  const email = "sim-" + Date.now() + "@example.com";
  const tr = await pool.query("INSERT INTO app.tenants (name) VALUES ('SimCo') RETURNING tenant_id");
  const tenantId = tr.rows[0].tenant_id;
  console.log("Created tenantId:", tenantId);

  await pool.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
  const ur = await pool.query("INSERT INTO app.users (tenant_id, email, hashed_password, role) VALUES ($1, $2, 'h1', 'owner') RETURNING user_id", [tenantId, email]);
  const userId = ur.rows[0].user_id;
  console.log("Created userId:", userId);

  // Now query as withTenant does
  const client = await pool.connect();
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
  await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId]);
  const res = await client.query(`
    SELECT u.email, u.role, t.name AS tenant_name, t.logo_url AS tenant_logo_url
    FROM app.users u JOIN app.tenants t ON t.tenant_id = u.tenant_id
    WHERE u.user_id = $1
  `, [userId]);
  console.log("Query result inside withTenant:", res.rows);
  await client.query("COMMIT");
  client.release();

  await pool.end();
}

main().catch(console.error);
