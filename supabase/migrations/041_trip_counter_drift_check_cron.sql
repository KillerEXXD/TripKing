-- TripKing — migration 041: daily drift check for `trips.applicant_count`.
-- Cleanup item from the cache-cleanup punchlist of issue #114 — defence-in-depth against
-- trigger bugs.
--
-- `trips.applicant_count` is denormalised: it's maintained by trigger
-- `trip_acceptances_count_aiud` (migration 002), which counts
-- `trip_acceptances WHERE status='applied'` after every I/U/D on that table. A trigger bug
-- or a manual data fix that skipped the trigger would corrupt the count indefinitely —
-- /trips badges, admin counts, and the "applicants" chip all read this column.
--
-- This cron runs once a day, recomputes the true count from `trip_acceptances`, and updates
-- only the rows that diverge. A NOTICE logs the changed-row count so a non-zero value
-- shows up in Postgres logs and is grep-able from /administration. No alerting framework
-- yet — if the log line ever fires, that's the signal to investigate the trigger.
--
-- `trips.driver_payout` is NOT in scope: the trigger fires BEFORE INSERT OR UPDATE OF the
-- specific input columns (total_fare, commission_pct, gst_amount, driver_bata — migration
-- 002; pickup_at, expected_end_at added in 024). Drift would require a direct UPDATE that
-- bypasses the trigger, which no code path does today. Re-evaluate if that changes.
--
-- Idempotent on its own (clean DB → no-op) and on schedule (cron.schedule upserts by
-- jobname). Safe to redeploy.

create extension if not exists pg_cron;

create or replace function public.reconcile_trip_counters()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fixed integer;
begin
  with actual as (
    select t.id, coalesce(count(ta.id) filter (where ta.status = 'applied'), 0)::int as live_count
    from public.trips t
    left join public.trip_acceptances ta on ta.trip_id = t.id
    group by t.id
  ),
  fix as (
    update public.trips t
    set applicant_count = a.live_count
    from actual a
    where t.id = a.id
      and coalesce(t.applicant_count, 0) is distinct from a.live_count
    returning t.id
  )
  select count(*) into v_fixed from fix;

  if v_fixed > 0 then
    raise notice 'trip_counter_drift: reconciled applicant_count on % row(s)', v_fixed;
  end if;
end;
$$;

grant execute on function public.reconcile_trip_counters() to postgres;
revoke execute on function public.reconcile_trip_counters() from public, anon, authenticated;

-- Daily at 04:17 UTC (different minute than the other housekeeping crons at 04:23 / 05:42
-- to spread load on the Supabase scheduler).
select cron.schedule(
  'trip-counter-drift-check',
  '17 4 * * *',
  $$select public.reconcile_trip_counters()$$
);
