-- TripKing — migration 048: expire vacancies whose window has closed.
--
-- Until now nothing flipped vacancies.status='active' → 'expired' once
-- available_until passed. Stale rows stayed in the agent "Vacant drivers" list
-- (e.g. yesterday's window still appearing today) and counted against the
-- driver's max_active_vacancies_per_driver quota.
--
-- Cron-driven sweep, mirrors expire_stale_selections (migration 031). The
-- list-endpoint also runtime-filters by available_until > now() — this cron
-- makes the DB row honest so /vacancies?driver_id=… and the active-count quota
-- reflect reality too.

create extension if not exists pg_cron;

create or replace function public.expire_stale_vacancies() returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_count int;
begin
  update public.vacancies
     set status     = 'expired',
         updated_at = now()
   where status in ('active', 'matched')
     and available_until is not null
     and available_until < now();

  get diagnostics expired_count = row_count;
  if expired_count > 0 then
    raise notice 'expire_stale_vacancies: % vacancy(ies) past available_until → expired', expired_count;
  end if;
end;
$$;

comment on function public.expire_stale_vacancies is
  'Flips vacancies whose available_until has passed from active/matched to expired. Cron-scheduled every 5 minutes (migration 048).';

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'vacancies_expire_stale') then
    perform cron.schedule(
      'vacancies_expire_stale',
      '*/5 * * * *',  -- every 5 minutes
      'select public.expire_stale_vacancies()'
    );
  end if;
end$$;

-- One-shot run so the current stale rows clear immediately (the user observed
-- yesterday's vacancies still showing in the agent list).
select public.expire_stale_vacancies();
