-- TripKing — migration 015: PostGIS-backed geo helpers (Phase D of the maps-backed-locations epic).
--   * <table>_in_radius(lat, lng, radius_m[, stale_mins]) → (id, distance_m) within the radius, nearest first.
--     Used by GET /trips, /vacancies, /drivers when ?near_lat&near_lng&radius_km are all given. They
--     prefer the place's geog and fall back to the curated-city lat/lng for legacy rows with no place.
--   * match_alerts_for_trip(trip_id) / match_alerts_for_vacancy(vacancy_id) → fires `alert_match`
--     notifications for active alerts whose from/to points (+ the other filters) match the new row.
--     Called from POST /trips and POST /vacancies. Owner is never notified about their own post.
-- security definer + search_path includes `extensions` so the PostGIS functions resolve; the GiST
-- indexes on places.geog / drivers.geog (migration 011) serve the ST_DWithin calls.

-- ── radius search ────────────────────────────────────────────────────────────
create or replace function public.trips_in_radius(p_lat numeric, p_lng numeric, p_radius_m numeric)
returns table(id uuid, distance_m double precision)
language sql stable security definer set search_path = public, extensions as $$
  with origin as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g)
  select t.id,
         st_distance(coalesce(fp.geog, st_setsrid(st_makepoint(fc.lng, fc.lat), 4326)::geography), o.g) as distance_m
    from public.trips t
    left join public.places fp on fp.id = t.from_place_id
    left join public.cities fc on fc.id = t.from_city_id,
         origin o
   where st_dwithin(coalesce(fp.geog, st_setsrid(st_makepoint(fc.lng, fc.lat), 4326)::geography), o.g, greatest(p_radius_m, 0))
   order by distance_m asc;
$$;

create or replace function public.vacancies_in_radius(p_lat numeric, p_lng numeric, p_radius_m numeric)
returns table(id uuid, distance_m double precision)
language sql stable security definer set search_path = public, extensions as $$
  with origin as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g)
  select v.id,
         st_distance(coalesce(cp.geog, st_setsrid(st_makepoint(cc.lng, cc.lat), 4326)::geography), o.g) as distance_m
    from public.vacancies v
    left join public.places cp on cp.id = v.current_place_id
    left join public.cities cc on cc.id = v.current_city_id,
         origin o
   where st_dwithin(coalesce(cp.geog, st_setsrid(st_makepoint(cc.lng, cc.lat), 4326)::geography), o.g, greatest(p_radius_m, 0))
   order by distance_m asc;
$$;

create or replace function public.drivers_in_radius(p_lat numeric, p_lng numeric, p_radius_m numeric, p_stale_minutes integer default 30)
returns table(id uuid, distance_m double precision)
language sql stable security definer set search_path = public, extensions as $$
  with origin as (select st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography as g)
  select d.id, st_distance(d.geog, o.g) as distance_m
    from public.drivers d, origin o
   where d.geog is not null
     and d.current_location_at is not null
     and d.current_location_at > now() - make_interval(mins => greatest(p_stale_minutes, 1))
     and st_dwithin(d.geog, o.g, greatest(p_radius_m, 0))
   order by distance_m asc;
$$;

grant execute on function public.trips_in_radius(numeric, numeric, numeric)              to anon, authenticated, service_role;
grant execute on function public.vacancies_in_radius(numeric, numeric, numeric)          to anon, authenticated, service_role;
grant execute on function public.drivers_in_radius(numeric, numeric, numeric, integer)   to anon, authenticated, service_role;

-- ── alert matching ───────────────────────────────────────────────────────────
-- Whether an alert's notify_via includes the only delivered channel ('in_app'); unset/empty ⇒ yes.
create or replace function public.alert_notifies_in_app(p_notify_via text[])
returns boolean language sql immutable as $$
  select 'in_app' = any(case when p_notify_via is null or array_length(p_notify_via, 1) is null then array['in_app'] else p_notify_via end);
$$;

create or replace function public.match_alerts_for_trip(p_trip_id uuid)
returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_count   integer := 0;
  v_poster  uuid;
  v_rate    numeric;
  v_comm    numeric;
  v_cartype uuid;
  v_pickup  timestamptz;
  v_from_g  geography;
  v_to_g    geography;
  a record;
begin
  select t.posted_by_user_id, t.rate_per_km, t.commission_pct, t.car_type_id, t.pickup_at,
         coalesce(fp.geog, st_setsrid(st_makepoint(fc.lng, fc.lat), 4326)::geography),
         coalesce(tp.geog, case when tc.lat is not null then st_setsrid(st_makepoint(tc.lng, tc.lat), 4326)::geography end)
    into v_poster, v_rate, v_comm, v_cartype, v_pickup, v_from_g, v_to_g
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
    if a.pickup_window_end is not null and v_pickup > a.pickup_window_end then continue; end if;
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

create or replace function public.match_alerts_for_vacancy(p_vacancy_id uuid)
returns integer
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_count  integer := 0;
  v_owner  uuid;          -- the vacancy's driver's user_id (never notify them)
  v_from_g geography;     -- the driver's current point
  a record;
begin
  select dr.user_id, coalesce(cp.geog, st_setsrid(st_makepoint(cc.lng, cc.lat), 4326)::geography)
    into v_owner, v_from_g
    from public.vacancies v
    left join public.places cp on cp.id = v.current_place_id
    left join public.cities cc on cc.id = v.current_city_id
    left join public.drivers dr on dr.id = v.driver_id
   where v.id = p_vacancy_id;
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
     where al.is_active and (v_owner is null or al.user_id <> v_owner)
  loop
    if a.a_from_g is null then continue; end if;
    if not st_dwithin(a.a_from_g, v_from_g, greatest(coalesce(a.from_radius_km, 0), 0) * 1000) then continue; end if;
    if a.a_to_g is not null then
      -- at least one of the vacancy's destinations must be within to_radius_km of the alert's 'to'
      if not exists (
        select 1 from public.vacancy_destinations vd
          left join public.places dp on dp.id = vd.place_id
          left join public.cities dc on dc.id = vd.city_id
         where vd.vacancy_id = p_vacancy_id
           and st_dwithin(coalesce(dp.geog, case when dc.lat is not null then st_setsrid(st_makepoint(dc.lng, dc.lat), 4326)::geography end),
                          a.a_to_g, greatest(coalesce(a.to_radius_km, a.from_radius_km, 0), 0) * 1000)
      ) then continue; end if;
    end if;
    if not public.alert_notifies_in_app(a.notify_via) then continue; end if;
    insert into public.notifications (user_id, type, title, body, payload_json)
    values (a.user_id, 'alert_match', 'A driver matches "' || a.name || '"',
            'A driver just posted availability you might want — reach out.',
            jsonb_build_object('kind', 'vacancy', 'alert_id', a.id, 'vacancy_id', p_vacancy_id));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

grant execute on function public.alert_notifies_in_app(text[])       to anon, authenticated, service_role;
grant execute on function public.match_alerts_for_trip(uuid)         to anon, authenticated, service_role;
grant execute on function public.match_alerts_for_vacancy(uuid)      to anon, authenticated, service_role;
