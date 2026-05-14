-- 037_backfill_trip_poster_pii.sql
--
-- Trips created before today had `posted_by_name` written as the poster's
-- users.display_name (often empty) and `posted_by_phone` written only if the
-- client body included it (which the frontend never did). The redactTrip()
-- function would happily reveal both fields to the assigned/accepted driver,
-- but the columns themselves were '' / NULL — so the driver kept seeing the
-- poster's display handle even after acceptance.
--
-- Trip-create now sources both fields from the poster's profile row
-- (drivers.full_name / drivers.phone or trip_managers.full_name /
-- trip_managers.phone). This migration backfills every existing trips row
-- where either column is empty, using the same fallback chain.

update public.trips t
   set posted_by_name  = coalesce(nullif(d.full_name, ''), nullif(u.display_name, ''), ''),
       posted_by_phone = coalesce(nullif(d.phone, ''), nullif(u.phone, ''), null)
  from public.users u
  join public.drivers d on d.user_id = u.id
 where t.posted_by_user_id = u.id
   and t.posted_by_role = 'driver'
   and (coalesce(t.posted_by_name, '') = '' or coalesce(t.posted_by_phone, '') = '');

update public.trips t
   set posted_by_name  = coalesce(nullif(m.full_name, ''), nullif(u.display_name, ''), ''),
       posted_by_phone = coalesce(nullif(m.phone, ''), nullif(u.phone, ''), null)
  from public.users u
  join public.trip_managers m on m.user_id = u.id
 where t.posted_by_user_id = u.id
   and t.posted_by_role = 'trip_manager'
   and (coalesce(t.posted_by_name, '') = '' or coalesce(t.posted_by_phone, '') = '');

-- ANALYZE so the planner gets fresh stats for the columns we just rewrote.
analyze public.trips;
