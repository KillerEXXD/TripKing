-- 054: Nightly purge of E2E test users.
--
-- Playwright specs in `e2e/` now create real backend state via the API (no stubs — see
-- docs/TEST_POLICY.md §"E2E preconditions are real"). Every test mints fresh users with
-- a `display_name` prefixed `e2e-…`. Without cleanup, the dev DB accumulates thousands of
-- throwaway rows within a week and the admin/observability views become unusable.
--
-- This cron deletes e2e-* users (and their cascading rows: drivers, agents, vacancies,
-- trips, applications, wallets, notifications) that haven't been touched in ≥ 7 days.
-- The 7-day window leaves time to debug a failing nightly run before the rows disappear.

create extension if not exists pg_cron;

create or replace function public.e2e_purge_old_users() returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count int;
begin
  delete from public.users
   where display_name like 'e2e-%'
     and created_at < now() - interval '7 days';

  get diagnostics deleted_count = row_count;
  if deleted_count > 0 then
    raise notice 'e2e_purge_old_users: deleted % stale e2e user(s)', deleted_count;
  end if;
end;
$$;

comment on function public.e2e_purge_old_users is
  'Deletes e2e-prefixed test users older than 7 days. Cron-scheduled nightly (migration 054). FK cascades clean up drivers/agents/trips/wallets/notifications.';

-- Schedule daily at 03:15 UTC (08:45 IST). Off-peak; avoids racing with the 02:30 nightly
-- Playwright run scheduled in .github/workflows/e2e-qase.yml so the run's fresh data has
-- 24h to be inspected.
select cron.schedule(
  'e2e_user_purge',
  '15 3 * * *',
  $$select public.e2e_purge_old_users();$$
);
