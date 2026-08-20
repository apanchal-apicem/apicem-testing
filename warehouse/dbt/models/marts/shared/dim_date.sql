-- Shared across all tenants, generated once (doc Sec 5.2). No tenant_id column, so this
-- model is intentionally excluded from the apply_rls() post-hook applied to other marts.
with spine as (
    {{ dbt_utils.date_spine(
        datepart="day",
        start_date="cast('2022-01-01' as date)",
        end_date="cast('2030-01-01' as date)"
    ) }}
)
select
    cast(date_day as date)                         as date_key,
    extract(year from date_day)::int                as year,
    extract(quarter from date_day)::int              as quarter,
    extract(month from date_day)::int                as month,
    extract(week from date_day)::int                 as week,
    extract(dow from date_day)::int                  as day_of_week,
    extract(dow from date_day) in (0, 6)             as is_weekend,
    extract(year from date_day)::int                 as fiscal_year,
    extract(quarter from date_day)::int              as fiscal_quarter
from spine
