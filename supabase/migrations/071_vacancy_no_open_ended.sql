-- TripKing — migration 071: vacancies are never open-ended.
--
-- An open-ended vacancy (available_until IS NULL) slipped through the auto-invite
-- time-bounds gate in trips.findMatchingDrivers: for a NULL available_until the gate
-- degrades to "today's_IST_midnight <= available_from <= pickup_at", which a far-future
-- pickup (a stale 2060 trip seen in QA) trivially satisfies — so an "available now"
-- driver got auto-invited to a 2060 trip.
--
-- The standard "I'm vacant" UI always sends a start + hours, so it never creates
-- open-ended rows. The open-ended rows came from the E2E helper (e2e/helpers-api.ts
-- postVacancy) POSTing /vacancies with no available_until; the edge function stored NULL.
-- ~60% of vacancies were open-ended as a result.
--
-- Fix: treat a missing end time as a fixed window (4h from available_from), enforced at
-- both the API (vacancies edge fn DEFAULT_VACANCY_DURATION_HOURS) and the DB (default +
-- NOT NULL below). Keep the 4h in sync with DEFAULT_VACANCY_DURATION_HOURS.

-- 1. Backfill: bound every open-ended row to a 4h window from its available_from.
update public.vacancies
   set available_until = available_from + interval '4 hours',
       updated_at      = now()
 where available_until is null;

-- 2. Expire the just-bounded rows whose 4h window is already in the past
--    (expire_stale_vacancies flips available_until < now() → 'expired'; see migration 058).
select public.expire_stale_vacancies();

-- 3. Enforce "never open-ended" at the DB layer (belt-and-suspenders behind the API default).
--    Safe now that step 1 removed all NULLs.
alter table public.vacancies
  alter column available_until set default (now() + interval '4 hours');
alter table public.vacancies
  alter column available_until set not null;

comment on column public.vacancies.available_until is
  'End of the availability window. NEVER NULL — a missing end time defaults to available_from + 4h (migration 071; mirrors vacancies edge fn DEFAULT_VACANCY_DURATION_HOURS). Open-ended vacancies were removed because they matched far-future trips through the auto-invite time-bounds gate.';
