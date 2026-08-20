{% macro tenant_scope_predicate(column) %}
{#
    Scopes an incremental mart rebuild to just the tenant(s) that actually synced this
    cycle, via the `sync_tenant_ids` var the orchestrator passes on every `dbt run`/`dbt
    test` invocation (orchestrator/dbt_runner.py). If the var isn't passed at all -- a
    developer running plain `dbt run` by hand, or the model's first-ever build -- this
    renders nothing, so the build falls back to today's full-rebuild behavior.
#}
{%- set tenant_ids = var('sync_tenant_ids', none) -%}
{%- if is_incremental() and tenant_ids is not none -%}
    {%- if tenant_ids | length == 0 -%}
        and false
    {%- else -%}
        and {{ column }} in ({%- for tid in tenant_ids -%}'{{ tid }}'{% if not loop.last %},{% endif %}{%- endfor -%})
    {%- endif -%}
{%- endif -%}
{% endmacro %}
