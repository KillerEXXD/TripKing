-- TripKing — migration 057: also expire open-ended vacancies (available_until IS NULL)
-- once their available_from is older than 24 hours.
--
-- Migration 048 only flipped vacancies → 'expired' when `available_until < now()`.
-- Vacancies posted with NULL `available_until` (open-ended) never expired — they
-- stayed in the agent /vacancies list indefinitely even when they'd clearly gone
-- stale (the user reported yesterday's drivers still showing today).
--
-- Treat NULL `available_until` as an implicit 24-hour window from `available_from`:
-- if a driver hasn't refreshed/extended within a day, the row is stale and gets
-- flipped to 'expired'. The driver still sees the expired row in their own
-- `/my-trips?tab=available` queue (red badge) so they can delete or repost it.

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
       or (available_until is null and available_from < now() - interval '24 hours')
     );

  get diagnostics expired_count = row_count;
  if expired_count > 0 then
    raise notice 'expire_stale_vacancies: % vacancy(ies) expired', expired_count;
  end if;
end;
$$;

comment on function public.expire_stale_vacancies is
  'Flips vacancies past their available_until (or open-ended ones whose available_from is >24h ago) from active/matched to expired. Cron every 5 min — see migration 048; 24h grace added in migration 057.';

-- One-shot run so the current stale open-ended rows clear immediately.
select public.expire_stale_vacancies();
