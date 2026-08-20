{# Re-applies the tenant_isolation RLS policy after a mart table is dropped and rebuilt
   (table materialization recreates the table each run, which drops any policy on it).
   Skip this on tables with no tenant_id column, e.g. the shared dim_date. #}
{% macro apply_rls() %}
    ALTER TABLE {{ this }} ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation ON {{ this }};
    CREATE POLICY tenant_isolation ON {{ this }}
        USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
{% endmacro %}
