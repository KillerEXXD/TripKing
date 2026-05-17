-- 055_fullstatus_snapshots.sql
--
-- Captures one row per /fullstatus run so the next run can render a "Trends vs last
-- run" table. Mirrors TournamentPro's `performance_snapshots` pattern (used by their
-- `_dbperf_snapshot_compare.cjs` script).
--
-- Step 8.6 of `.claude/commands/fullstatus.md` inserts a row, then SELECTs the prior
-- row, computes deltas, and renders a Trends table. Without this table, the step
-- prints "Snapshots not configured" and skips.
--
-- Retention: indefinite for now (one row per /fullstatus run, ~5-20 rows/week at
-- most). When the table reaches ~10k rows, add a pg_cron job to keep last 90 days.

create table if not exists public.fullstatus_snapshots (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- API tier (from api_metrics, 24h rollup)
  api_total_requests int,
  api_avg_ms        numeric(10, 2),
  api_p95_ms        numeric(10, 2),
  api_max_ms        numeric(10, 2),
  api_error_pct     numeric(5, 2),    -- 4xx + 5xx as % of total
  api_5xx_count     int,

  -- Cache tier (origin)
  cache_origin_hit_pct numeric(5, 2),  -- (memory+shared) / (memory+shared+miss)
  cache_unwrapped_pct  numeric(5, 2),  -- NULL cache_status as % of total

  -- Database
  db_table_cache_hit_pct numeric(5, 2),
  db_index_cache_hit_pct numeric(5, 2),
  db_size_mb            numeric(10, 2),
  db_largest_table_mb   numeric(10, 2),
  db_largest_table_name text,

  -- Sentry (live issues — after stale-fix auto-resolution)
  sentry_live_issues   int,
  sentry_total_events  int,
  sentry_unique_users  int,

  -- Speed Insights (Core Web Vitals p75, from PostHog $web_vitals, 24h)
  lcp_p75   numeric(10, 2),
  inp_p75   numeric(10, 2),
  cls_p75   numeric(5, 3),
  fcp_p75   numeric(10, 2),
  ttfb_p75  numeric(10, 2),

  -- E2E (scheduled run)
  e2e_passed int,
  e2e_failed int,
  e2e_conclusion text,    -- 'success' | 'failure' | 'cancelled' | 'skipped'

  -- Free-form metadata — git sha, run trigger (manual / cron), etc.
  meta jsonb default '{}'::jsonb
);

comment on table public.fullstatus_snapshots is
  'One row per /fullstatus run. Step 8.6 of the skill SELECTs the previous row, computes deltas, and renders a Trends table. See .claude/commands/fullstatus.md.';

-- The skill's SELECT is "give me the row right before the one I just inserted",
-- which is `ORDER BY created_at DESC LIMIT 2`. An index on created_at DESC keeps
-- that query a single index lookup even when the table grows.
create index if not exists idx_fullstatus_snapshots_created_at
  on public.fullstatus_snapshots (created_at desc);

-- RLS — admin-only. /fullstatus is operator-only; this table is operational telemetry.
alter table public.fullstatus_snapshots enable row level security;

create policy "Admins can read fullstatus_snapshots"
  on public.fullstatus_snapshots for select
  using (
    exists (
      select 1 from public.users where users.id = auth.uid() and users.role = 'admin'
    )
  );

create policy "Service-role inserts fullstatus_snapshots"
  on public.fullstatus_snapshots for insert
  with check (auth.uid() is null or exists (
    select 1 from public.users where users.id = auth.uid() and users.role = 'admin'
  ));
