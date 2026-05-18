-- TripKing — migration 058: open-ended vacancies expire when the IST calendar
-- date advances past `available_from`'s date (not after a fixed 24h grace).
--
-- Migration 057 added a 24h grace for vacancies with NULL `available_until`.
-- The user reported that wasn't aggressive enough — a vacancy posted on the
-- 17th at 7:22 pm IST still showed in the agent list at 8 am IST on the 18th
-- because the 24h hadn't elapsed.
--
-- The user's mental model is calendar-day-based: "if it says 'from May 17',
-- it shouldn't show up on May 18 at all". Switch the rule to:
--   the row is stale if  (available_from at IST)::date < (now() at IST)::date
--
-- IST = Asia/Kolkata is the operating timezone for the marketplace; pinning
-- the boundary there keeps the rule predictable regardless of server TZ.

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
     and (
       (available_until is not null and available_until < now())
       or (
         available_until is null
         and (available_from at time zone 'Asia/Kolkata')::date
             < (now() at time zone 'Asia/Kolkata')::date
       )
     );

  get diagnostics expired_count = row_count;
  if expired_count > 0 then
    raise notice 'expire_stale_vacancies: % vacancy(ies) expired', expired_count;
  end if;
end;
$$;

comment on function public.expire_stale_vacancies is
  'Flips vacancies past their available_until (or open-ended ones whose available_from is on a prior IST calendar day) from active/matched to expired. Cron every 5 min — see migration 048; IST-calendar-day rule landed in migration 058.';

-- One-shot run so the current stale rows clear immediately.
select public.expire_stale_vacancies();
