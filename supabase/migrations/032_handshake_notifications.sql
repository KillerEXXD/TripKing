-- Migration 032 — Phase 3 of the trip-assignment two-step handshake.
-- Extends notifications.type CHECK with the four new handshake events, and
-- updates the cron-driven expire_stale_selections() function (migration 031)
-- to ALSO insert selection_expired notifications for both sides of the trip.

-- ── notifications.type — extend with handshake events ───────────────────────
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'alert_match',
  'kyc_status_change',
  'trip_assigned',
  'trip_cancelled',
  'trip_completed',
  'review_received',
  'account_status_change',
  'trip_invitation',
  'invitation_accepted',
  'invitation_declined',
  'bug_reported',
  'bug_resolved',
  'bug_commented',
  -- Phase 3 of the two-step handshake (this migration):
  'trip_selected',              -- agent picked this driver; window started
  'trip_assignment_cancelled',  -- agent withdrew the selection / assignment
  'selection_expired',          -- driver didn't accept in time (cron-fired)
  'driver_declined'             -- driver actively declined after being selected
));

-- ── replace expire_stale_selections to ALSO fan out notifications ──────────
create or replace function public.expire_stale_selections() returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  expired_count int := 0;
begin
  -- Capture the trips we're about to expire so we can fan out notifications
  -- to both the driver (the picked one) and the agent (the trip poster).
  for r in
    select t.id              as trip_id,
           t.posted_by_user_id,
           t.assigned_driver_id,
           t.assigned_acceptance_id,
           ta.driver_id       as acceptance_driver_id,
           ta_driver.user_id  as driver_user_id,
           t.from_city_id,
           t.to_city_id
      from public.trips t
      left join public.trip_acceptances ta on ta.id = t.assigned_acceptance_id
      left join public.drivers ta_driver on ta_driver.id = t.assigned_driver_id
     where t.status = 'selected'
       and t.acceptance_deadline_at is not null
       and t.acceptance_deadline_at < now()
  loop
    expired_count := expired_count + 1;
    -- Flip the matching trip_acceptances row to 'expired' (driver out of pool).
    if r.assigned_acceptance_id is not null then
      update public.trip_acceptances
         set status = 'expired',
             decision_at = now()
       where id = r.assigned_acceptance_id;
    end if;
    -- Reset the trip row.
    update public.trips
       set status = case
                      when (select count(*) from public.trip_acceptances ta2
                              where ta2.trip_id = r.trip_id and ta2.status = 'applied') > 0
                      then 'has_applicants'
                      else 'open'
                    end,
           assigned_driver_id     = null,
           assigned_vehicle_id    = null,
           assigned_acceptance_id = null,
           assigned_at            = null,
           acceptance_deadline_at = null,
           driver_acceptance_status = 'expired'
     where id = r.trip_id;
    -- Notify the agent (always).
    insert into public.notifications (user_id, type, title, body, payload_json)
    values (
      r.posted_by_user_id,
      'selection_expired',
      'Driver did not accept in time',
      'The driver you picked did not respond before the window closed. Pick another applicant.',
      jsonb_build_object('trip_id', r.trip_id)
    );
    -- Notify the driver (if we resolved their user_id from the joined row).
    if r.driver_user_id is not null then
      insert into public.notifications (user_id, type, title, body, payload_json)
      values (
        r.driver_user_id,
        'selection_expired',
        'Selection expired',
        'You did not accept the trip in time. Other applicants will be considered.',
        jsonb_build_object('trip_id', r.trip_id)
      );
    end if;
  end loop;

  if expired_count > 0 then
    raise notice 'expire_stale_selections: % trip(s) expired + notifications fanned out', expired_count;
  end if;
end;
$$;
