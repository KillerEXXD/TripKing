-- TripKing — migration 061: when the last applicant withdraws / is rejected /
-- expires, trips.status should fall back from 'has_applicants' to 'open'.
--
-- Before this migration, the trigger on trip_acceptances kept `applicant_count`
-- accurate but never touched `status`. So a trip whose only applicant
-- withdrew stayed flagged 'has_applicants' forever — the home card "1 trip
-- need a driver" still fired, but the applicants list was empty. The user
-- reported "no applicants seen" for trip a46ab72e-… on 2026-05-18.
--
-- The recoupling is one-directional and lifecycle-safe: we only revert
-- has_applicants → open. Once a trip leaves the open/has_applicants pair
-- (selected, accepted, in_progress, completed, cancelled), status is
-- locked to its lifecycle progression and the trigger is a no-op.

create or replace function public.bump_trip_applicant_count() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_trip uuid;
  v_count int;
  v_status text;
begin
  v_trip := coalesce(new.trip_id, old.trip_id);
  select count(*) into v_count
    from public.trip_acceptances
   where trip_id = v_trip and status = 'applied';

  update public.trips
     set applicant_count = v_count,
         -- Auto-transition only between the two pre-selection states:
         --   open ↔ has_applicants based on whether anyone is currently applied.
         -- Any other lifecycle state (selected/accepted/in_progress/completed/cancelled)
         -- is preserved — the agent has already made progress and we don't want a
         -- withdrawn applicant to nuke that.
         status = case
           when status = 'has_applicants' and v_count = 0 then 'open'
           when status = 'open' and v_count > 0 then 'has_applicants'
           else status
         end
   where id = v_trip;

  return null;
end;
$$;

comment on function public.bump_trip_applicant_count is
  'Trigger fn on trip_acceptances: keeps trips.applicant_count accurate and bounces trips.status between open ↔ has_applicants based on whether any rows are currently status=applied (migration 061).';

-- Reconcile current drift. The cron in migration 041 only fixes applicant_count,
-- not status — so any trip whose last applicant withdrew before this migration
-- shipped is still stuck on 'has_applicants'. Flip them back to 'open' now.
update public.trips
   set status = 'open'
 where status = 'has_applicants'
   and applicant_count = 0;
