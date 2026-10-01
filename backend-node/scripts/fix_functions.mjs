import pg from "pg";

const pool = new pg.Pool({
  host: "localhost",
  user: "apicem",
  password: "Root123",
  database: "apicem",
});

async function main() {
  await pool.query(`
    CREATE OR REPLACE FUNCTION app.reset_password(p_user_id uuid, p_hashed_password text)
    RETURNS TABLE(user_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
    BEGIN
        RETURN QUERY
        UPDATE app.users u SET hashed_password = p_hashed_password WHERE u.user_id = p_user_id
        RETURNING u.user_id;
    END;
    $$;
  `);

  await pool.query(`
    CREATE OR REPLACE FUNCTION app.login_lookup(p_email text)
    RETURNS TABLE(user_id uuid, tenant_id uuid, hashed_password text, role text, name text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
    BEGIN
        RETURN QUERY
        SELECT u.user_id, u.tenant_id, u.hashed_password, u.role, u.name
        FROM app.users u
        WHERE u.email = p_email;
    END;
    $$;
  `);

  await pool.query(`
    ALTER FUNCTION app.reset_password(uuid, text) OWNER TO apicem;
    ALTER FUNCTION app.login_lookup(text) OWNER TO apicem;
    GRANT EXECUTE ON FUNCTION app.reset_password(uuid, text) TO apicem_app;
    GRANT EXECUTE ON FUNCTION app.login_lookup(text) TO apicem_app;
  `);

  await pool.query(`
    DROP POLICY IF EXISTS tenant_isolation ON app.users;
    CREATE POLICY tenant_isolation ON app.users
        USING (
            tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
            OR EXISTS (
                SELECT 1 FROM app.workspace_memberships m
                WHERE m.user_id = app.users.user_id
                  AND m.workspace_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
            )
        )
        WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

    DROP POLICY IF EXISTS membership_visibility ON app.workspace_memberships;
    CREATE POLICY membership_visibility ON app.workspace_memberships
        USING (
            user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
            OR workspace_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
        )
        WITH CHECK (
            workspace_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid
        );

    DROP POLICY IF EXISTS tenant_isolation ON app.secrets;
    CREATE POLICY tenant_isolation ON app.secrets
        USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

    DROP POLICY IF EXISTS tenant_isolation ON app.connections;
    CREATE POLICY tenant_isolation ON app.connections
        USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);

    DROP POLICY IF EXISTS tenant_isolation ON app.job_runs;
    CREATE POLICY tenant_isolation ON app.job_runs
        USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid)
        WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), '')::uuid);
  `);

  console.log("Functions and RLS policies updated successfully!");
  await pool.end();
}

main().catch(console.error);
