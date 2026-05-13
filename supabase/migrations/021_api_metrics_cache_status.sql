-- TripKing — migration 021: cache-aware api_metrics + RPC update.
-- Phase 4 of the caching strategy (see docs/CACHE_BASELINE.md). Adds the column the edge
-- functions started stamping in Phase 1 (`X-Cache: memory|shared|miss`), so we can split
-- "cold miss latency" from "warm hit latency" in the dashboard / `/metrics` skill.
--
-- Old rows pre-Phase-4 stay at cache_status = NULL (treated as "unknown" by the rollup).

alter table public.api_metrics add column if not exists cache_status text;

-- index for the rollup's GROUP BY (cheap; column is low-cardinality)
create index if not exists idx_api_metrics_cache_status on public.api_metrics (cache_status) where cache_status is not null;

-- Replace the rollup to break out by cache status — backwards-compatible: the existing
-- top-level keys (count, errors, avg_ms, etc.) stay; a new `cache` block adds the split.
create or replace function public.get_api_metrics_summary(p_hours integer default 24)
returns jsonb language sql stable security definer set search_path = public as $$
  with since as (select now() - make_interval(hours => greatest(p_hours, 1)) as ts),
  rows as (
    select endpoint, status, duration_ms, cache_status
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
      round(percentile_cont(0.95) within group (order by duration_ms))::int as p95_ms,
      count(*) filter (where cache_status = 'memory')                       as cache_memory,
      count(*) filter (where cache_status = 'shared')                       as cache_shared,
      count(*) filter (where cache_status = 'miss')                         as cache_miss,
      count(*) filter (where cache_status is null)                          as cache_unknown,
      round(avg(duration_ms) filter (where cache_status in ('memory','shared')))::int as hit_avg_ms,
      round(avg(duration_ms) filter (where cache_status = 'miss'))::int     as miss_avg_ms
    from rows
    group by endpoint
  )
  select jsonb_build_object(
    'hours',        greatest(p_hours, 1),
    'since',        (select ts from since),
    'generated_at', now(),
    'total',        (select count(*) from rows),
    'errors',       (select count(*) from rows where status >= 500),
    'cache',        jsonb_build_object(
      'memory',  (select count(*) from rows where cache_status = 'memory'),
      'shared',  (select count(*) from rows where cache_status = 'shared'),
      'miss',    (select count(*) from rows where cache_status = 'miss'),
      'unknown', (select count(*) from rows where cache_status is null),
      'hit_rate_pct',
        case
          when (select count(*) from rows where cache_status is not null) = 0 then null
          else round(
            100.0 * (select count(*) from rows where cache_status in ('memory','shared'))
                  / nullif((select count(*) from rows where cache_status is not null), 0)
          , 2)
        end
    ),
    'endpoints',    coalesce(
      (select jsonb_agg(to_jsonb(p) order by p.count desc) from per_endpoint p),
      '[]'::jsonb
    )
  );
$$;
grant execute on function public.get_api_metrics_summary(integer) to authenticated, anon, service_role;
