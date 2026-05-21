-- 071_trip_categories_and_packages.sql
-- Introduce trip *categories* (Local / Outstation / Package) on top of the existing
-- trip *types* (one_way / round_trip / multi_way), and the hourly-rental "Package" fields.
--
--   - local      : booked by address (place_id); city derived server-side. trip_type = one_way.
--   - outstation : city-to-city (today's behaviour). trip_type one_way | round_trip.
--   - package    : hourly rental — pickup only, hours + included km, agent-entered price.
--
-- Cities stay NOT NULL: Local/Package still resolve a from_city_id/to_city_id (the trips
-- edge function derives it from the searched address — place.city_id, else nearest city).
-- The waypoint mirror trigger (migration 024) is unaffected.

alter table public.trips
  add column if not exists trip_category text not null default 'outstation',
  add column if not exists package_hours smallint,
  add column if not exists package_included_km smallint;

-- Backfill is implicit (DEFAULT 'outstation' applies to existing rows).

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'trips_trip_category_check'
  ) then
    alter table public.trips
      add constraint trips_trip_category_check
      check (trip_category in ('local', 'outstation', 'package'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'trips_package_fields_check'
  ) then
    alter table public.trips
      add constraint trips_package_fields_check
      check (
        trip_category <> 'package'
        or (package_hours is not null and package_hours >= 4 and package_included_km is not null and package_included_km > 0)
      );
  end if;
end $$;

create index if not exists idx_trips_category_status on public.trips (trip_category, status);

analyze public.trips;
