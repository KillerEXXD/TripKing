-- TripKing — migration 018: housekeeping cron — purge old api_metrics rows weekly.
-- withTiming() fire-and-forget-inserts one row into public.api_metrics per request (migration 005);
-- the table never shrinks on its own. GET /analytics/api-metrics only ever looks back ?hours= (≤ a
-- few days), so anything older than 30 days is dead weight. A weekly sweep keeps it tiny — mirrors
-- the rate-limits-cleanup job (migration 013). pg_cron runs in the `postgres` database (Supabase's default).
create extension if not exists pg_cron;

-- index the column the cleanup delete (and get_api_metrics_summary) filters on — no-op if it exists.
create index if not exists idx_api_metrics_created_at on public.api_metrics (created_at);

-- cron.schedule(jobname, schedule, command) upserts by jobname (pg_cron ≥ 1.4) — safe to re-run.
select cron.schedule(
  'api-metrics-cleanup',
  '23 4 * * 0',                                                              -- Sundays at 04:23 UTC
  $$delete from public.api_metrics where created_at < now() - interval '30 days'$$
);
