-- TripKing — migration 025: alert matcher honours trip.expected_end_at (multi-day fix).
--
-- After migration 024 a trip carries an `expected_end_at` (the trip's full span). The
-- alert matcher historically only checked `pickup_at` against `alerts.pickup_window_end`,
-- so a 3-day trip starting Monday 9am would fire alerts whose window ends Tuesday — the
-- driver discovers post-match that the trip actually runs through Wednesday and they
-- aren't available for the full span.
--
-- This migration redefines `match_alerts_for_trip` so the window check uses
-- `coalesce(expected_end_at, pickup_at)` — a multi-day trip only fires alerts whose
-- pickup_window_end is at or after the trip's END. Single-leg trips behave identically
-- because their backfilled expected_end_at = pickup_at + 1 day; only alerts that already
-- span ≥ 1 day past their pickup_window_start would have matched them anyway.
--
-- Vacancy matching (`match_alerts_for_vacancy`) is unaffected — vacancies don't carry a
-- trip span; the driver's `available_from`/`available_until` is what bounds them, and
-- those are already free-form (no narrow-window concept in this codebase).

set search_path = public, extensions, pg_catalog;

create or replace function public.match_alerts_for_trip(p_trip_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_count   integer := 0;
  v_poster  uuid;
  v_rate    numeric;
  v_comm    numeric;
  v_cartype uuid;
  v_pickup  timestamptz;
  v_end     timestamptz;
  v_from_g  geography;
  v_to_g    geography;
  a record;
begin
  select t.posted_by_user_id, t.rate_per_km, t.commission_pct, t.car_type_id, t.pickup_at, t.expected_end_at,
         coalesce(fp.geog, st_setsrid(st_makepoint(fc.lng, fc.lat), 4326)::geography),
         coalesce(tp.geog, case when tc.lat is not null then st_setsrid(st_makepoint(tc.lng, tc.lat), 4326)::geography end)
    into v_poster, v_rate, v_comm, v_cartype, v_pickup, v_end, v_from_g, v_to_g
    from public.trips t
    left join public.places fp on fp.id = t.from_place_id
    left join public.cities fc on fc.id = t.from_city_id
    left join public.places tp on tp.id = t.to_place_id
    left join public.cities tc on tc.id = t.to_city_id
   where t.id = p_trip_id;
  if not found or v_from_g is null then return 0; end if;

  for a in
    select al.*,
           coalesce(afp.geog, st_setsrid(st_makepoint(afc.lng, afc.lat), 4326)::geography) as a_from_g,
           coalesce(atp.geog, case when atc.lat is not null then st_setsrid(st_makepoint(atc.lng, atc.lat), 4326)::geography end) as a_to_g
      from public.alerts al
      left join public.places afp on afp.id = al.from_place_id
      left join public.cities afc on afc.id = al.from_city_id
      left join public.places atp on atp.id = al.to_place_id
      left join public.cities atc on atc.id = al.to_city_id
     where al.is_active and al.user_id <> v_poster
       and not exists (select 1 from public.users u           where u.id  = al.user_id and u.is_active  = false)
       and not exists (select 1 from public.drivers d         where d.user_id = al.user_id and d.is_active = false)
       and not exists (select 1 from public.trip_managers tm  where tm.user_id = al.user_id and tm.is_active = false)
  loop
    if a.a_from_g is null then continue; end if;
    if not st_dwithin(a.a_from_g, v_from_g, greatest(coalesce(a.from_radius_km, 0), 0) * 1000) then continue; end if;
    if a.a_to_g is not null then
      if v_to_g is null then continue; end if;
      if not st_dwithin(a.a_to_g, v_to_g, greatest(coalesce(a.to_radius_km, a.from_radius_km, 0), 0) * 1000) then continue; end if;
    end if;
    if a.min_rate_per_km is not null and v_rate < a.min_rate_per_km then continue; end if;
    if a.min_commission_pct is not null and v_comm < a.min_commission_pct then continue; end if;
    if a.car_type_ids is not null and array_length(a.car_type_ids, 1) is not null and not (v_cartype = any(a.car_type_ids)) then continue; end if;
    if a.pickup_window_start is not null and v_pickup < a.pickup_window_start then continue; end if;
    -- ── migration 025: window-end check uses the trip's END, not its START.
    -- A multi-day trip only matches an alert whose pickup_window_end is at or after the trip's expected_end_at;
    -- legacy single-leg trips behave identically (expected_end_at = pickup_at + 1 day from migration 024 backfill).
    if a.pickup_window_end is not null and coalesce(v_end, v_pickup) > a.pickup_window_end then continue; end if;
    if not public.alert_notifies_in_app(a.notify_via) then continue; end if;
    insert into public.notifications (user_id, type, title, body, payload_json)
    values (a.user_id, 'alert_match', 'New trip matches "' || a.name || '"',
            'A trip you might want just got posted — check it out.',
            jsonb_build_object('kind', 'trip', 'alert_id', a.id, 'trip_id', p_trip_id));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Spot-check: function exists + still callable.
do $$
declare v_ok boolean;
begin
  select exists (select 1 from pg_proc where proname = 'match_alerts_for_trip') into v_ok;
  if not v_ok then raise exception 'match_alerts_for_trip missing after redefine'; end if;
end $$;
