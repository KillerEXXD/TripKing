-- TripKing — migration 006: a read-side rollup for the api_metrics table.
-- Powers GET /analytics/api-metrics (admin only). One JSONB blob: per-endpoint
-- count / error count (status >= 500) / avg / max / p95 latency, plus the window.

create or replace function public.get_api_metrics_summary(p_hours integer default 24)
returns jsonb language sql stable security definer set search_path = public as $$
  with since as (select now() - make_interval(hours => greatest(p_hours, 1)) as ts),
  rows as (
    select endpoint, status, duration_ms
    from public.api_metrics, since
    where created_at >= since.ts
  ),
  per_endpoint as (
    select
      endpoint,
      count(*)                                                              as count,
      count(*) filter (where status >= 500)                                 as errors,
      round(avg(duration_ms))::int                                          as avg_ms,
      max(duration_ms)                                                      as max_ms,
      round(percentile_cont(0.95) within group (order by duration_ms))::int as p95_ms
    from rows
    group by endpoint
  )
  select jsonb_build_object(
    'hours',        greatest(p_hours, 1),
    'since',        (select ts from since),
    'generated_at', now(),
    'total',        (select count(*) from rows),
    'errors',       (select count(*) from rows where status >= 500),
    'endpoints',    coalesce(
      (select jsonb_agg(to_jsonb(p) order by p.count desc) from per_endpoint p),
      '[]'::jsonb
    )
  );
$$;
grant execute on function public.get_api_metrics_summary(integer) to authenticated, anon, service_role;
