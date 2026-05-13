-- TripKing — migration 017: admin can deactivate a driver / agent (trip-manager) profile.
--
--   * public.drivers / public.trip_managers gain:
--       is_active            boolean not null default true   -- the kill switch checked everywhere
--       deactivated_at       timestamptz                     -- when it was last flipped off
--       deactivation_reason  text                            -- the admin-supplied reason
--       deactivated_by       uuid → public.users(id)         -- which admin did it
--     + an index on is_active (the default GET-list filter, and the alert-matching joins, use it).
--   * public.notifications.type gains 'account_status_change' (fired by PATCH /drivers|/agents/:id/active).
--   * match_alerts_for_trip / match_alerts_for_vacancy now skip alerts whose owner's account
--     (users.is_active) or driver/agent profile is deactivated, and a deactivated driver's
--     vacancy never matches an alert.
--
-- Enforcement lives in the edge functions (this migration only provides the columns / constraint /
-- SQL fns): PATCH /drivers/:id/active and PATCH /agents/:id/active (admin only) flip the flag, stamp
-- deactivated_at/reason/by, audit to admin_audit_log, and fire an account_status_change notification.
-- GET /drivers|/agents default to is_active = true (widen with ?active=false or ?include_inactive=true);
-- GET /drivers|/agents/:id → 404 for an inactive profile unless the caller is its owner or an admin;
-- GET /drivers/me|/agents/me still returns it (with is_active:false). GET /vacancies excludes vacancies
-- of deactivated drivers. POST /vacancies, POST /trips, POST /trips/:id/applicants, POST /reviews →
-- 403 ACCOUNT_SUSPENDED when the acting driver/agent profile is is_active = false. POST /trips/:id/assign
-- → 422 when the chosen acceptance's driver is is_active = false. /auth verify-otp → 403 when
-- users.is_active = false ("account suspended" — the account-level kill switch, orthogonal to KYC).

-- ── columns ──────────────────────────────────────────────────────────────────
alter table public.drivers
  add column if not exists is_active           boolean not null default true,
  add column if not exists deactivated_at      timestamptz,
  add column if not exists deactivation_reason text,
  add column if not exists deactivated_by      uuid references public.users(id);
create index if not exists idx_drivers_is_active on public.drivers (is_active);

alter table public.trip_managers
  add column if not exists is_active           boolean not null default true,
  add column if not exists deactivated_at      timestamptz,
  add column if not exists deactivation_reason text,
  add column if not exists deactivated_by      uuid references public.users(id);
create index if not exists idx_trip_managers_is_active on public.trip_managers (is_active);

-- ── notifications.type — add 'account_status_change' ─────────────────────────
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('alert_match','kyc_status_change','trip_assigned','trip_cancelled','trip_completed','review_received','account_status_change'));

-- ── alert matching: skip deactivated owners + a deactivated driver's vacancy ─
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
  v_count   integer := 0;
  v_owner   uuid;          -- the vacancy's driver's user_id (never notify them)
  v_active  boolean;       -- the vacancy's driver's is_active
  v_from_g  geography;     -- the driver's current point
  a record;
begin
  select dr.user_id, dr.is_active, coalesce(cp.geog, st_setsrid(st_makepoint(cc.lng, cc.lat), 4326)::geography)
    into v_owner, v_active, v_from_g
    from public.vacancies v
    left join public.places cp on cp.id = v.current_place_id
    left join public.cities cc on cc.id = v.current_city_id
    left join public.drivers dr on dr.id = v.driver_id
   where v.id = p_vacancy_id;
  if not found or v_from_g is null then return 0; end if;
  if v_active is false then return 0; end if;   -- a deactivated driver's vacancy matches nothing

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
       and not exists (select 1 from public.users u           where u.id  = al.user_id and u.is_active  = false)
       and not exists (select 1 from public.drivers d         where d.user_id = al.user_id and d.is_active = false)
       and not exists (select 1 from public.trip_managers tm  where tm.user_id = al.user_id and tm.is_active = false)
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

grant execute on function public.match_alerts_for_trip(uuid)     to anon, authenticated, service_role;
grant execute on function public.match_alerts_for_vacancy(uuid)  to anon, authenticated, service_role;

analyze public.drivers;
analyze public.trip_managers;
