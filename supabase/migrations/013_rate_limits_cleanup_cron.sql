-- TripKing — migration 013: housekeeping cron — purge stale rate_limits buckets daily.
-- The rate_limits table (migration 005) accumulates one row per (bucket) — verify-otp:<phone>,
-- post-trip:<user>, places-search:<ip>, … — and never shrinks on its own. A row is dead once its
-- window has rolled over (updated_at older than the longest window, ~10 min); a daily sweep keeps
-- the table tiny. pg_cron runs in the `postgres` database (Supabase's default).
create extension if not exists pg_cron;

-- cron.schedule(jobname, schedule, command) upserts by jobname (pg_cron ≥ 1.4) — safe to re-run.
select cron.schedule(
  'rate-limits-cleanup',
  '17 3 * * *',                                                              -- daily at 03:17 UTC
  $$delete from public.rate_limits where updated_at < now() - interval '1 day'$$
);
