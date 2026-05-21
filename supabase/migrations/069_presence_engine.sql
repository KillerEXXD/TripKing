-- Presence engine for Auto-dispatch (PR3).
--
-- The server-side RPCs behind the "I'm Online" runtime + the grace-expiry cron.
-- All SECURITY DEFINER, called by the /drivers edge function (service role) and,
-- later, the dispatch engine. Tunables come from the single app_settings row.
--
-- Three states (derived, never stored): online / grace / offline. See
-- docs/DISPATCH_IMPLEMENTATION_PLAN.md.

-- ── go online ────────────────────────────────────────────────────────────────
-- Reconnect within the grace window keeps the existing global token; otherwise a
-- fresh token is allocated from the sequence (back of the global queue).
create or replace function public.driver_go_online(p_driver_id uuid, p_vehicle_id uuid, p_lat numeric, p_lng numeric)
returns public.driver_presence
language plpgsql security definer set search_path = public as $$
declare
  existing public.driver_presence;
  v_token  bigint;
  result   public.driver_presence;
begin
  select * into existing from public.driver_presence where driver_id = p_driver_id;

  if existing.driver_id is not null
     and existing.token is not null
     and existing.grace_expires_at is not null
     and existing.grace_expires_at > now() then
    v_token := existing.token;            -- reconnect within grace → keep place
  else
    v_token := nextval('driver_token_seq'); -- fresh → back of the queue
  end if;

  insert into public.driver_presence as dp
    (driver_id, is_online, token, online_since, last_heartbeat_at, current_lat, current_lng, went_offline_at, grace_expires_at, vehicle_id)
  values
    (p_driver_id, true, v_token, now(), now(), p_lat, p_lng, null, null, p_vehicle_id)
  on conflict (driver_id) do update set
    is_online        = true,
    token            = v_token,
    online_since     = now(),
    last_heartbeat_at = now(),
    current_lat      = excluded.current_lat,
    current_lng      = excluded.current_lng,
    went_offline_at  = null,
    grace_expires_at = null,
    vehicle_id       = excluded.vehicle_id
  returning * into result;

  -- keep the drivers live-location columns in sync (live tracking + drivers_in_radius).
  update public.drivers set current_lat = p_lat, current_lng = p_lng, current_location_at = now() where id = p_driver_id;
  return result;
end $$;

-- ── heartbeat ─────────────────────────────────────────────────────────────────
-- Refresh GPS + liveness. A heartbeat from an in-grace driver who still holds a
-- token brings them back online (reconnect). If the token was already cleared
-- (grace expired), the heartbeat does NOT resurrect them — they must go online.
create or replace function public.driver_heartbeat(p_driver_id uuid, p_lat numeric, p_lng numeric)
returns public.driver_presence
language plpgsql security definer set search_path = public as $$
declare result public.driver_presence;
begin
  update public.driver_presence set
    last_heartbeat_at = now(),
    current_lat       = p_lat,
    current_lng       = p_lng,
    is_online         = (token is not null),
    went_offline_at   = case when token is not null then null else went_offline_at end,
    grace_expires_at  = case when token is not null then null else grace_expires_at end
  where driver_id = p_driver_id
  returning * into result;

  if result.driver_id is not null then
    update public.drivers set current_lat = p_lat, current_lng = p_lng, current_location_at = now() where id = p_driver_id;
  end if;
  return result;
end $$;

-- ── go offline ──────────────────────────────────────────────────────────────
-- Starts the grace countdown; the token is retained until the grace expires.
create or replace function public.driver_go_offline(p_driver_id uuid)
returns public.driver_presence
language plpgsql security definer set search_path = public as $$
declare
  s      public.app_settings;
  result public.driver_presence;
begin
  select * into s from public.app_settings where id = 1;
  update public.driver_presence set
    is_online        = false,
    went_offline_at  = now(),
    grace_expires_at = now() + make_interval(secs => s.dispatch_offline_grace_seconds)
  where driver_id = p_driver_id
  returning * into result;
  return result;
end $$;

-- ── eligible online drivers within a radius, ordered by global token ─────────
-- Radius is the HARD gate; the token only orders the already-reachable set.
-- Excludes stale-heartbeat, in-grace (token-held but offline), and busy drivers.
create or replace function public.online_drivers_in_radius(p_lat numeric, p_lng numeric, p_radius_m numeric)
returns table(driver_id uuid, token bigint, distance_m double precision)
language sql stable security definer set search_path = public, extensions as $$
  select dp.driver_id, dp.token,
         st_distance(dp.geog, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) as distance_m
  from public.driver_presence dp
  cross join (select dispatch_heartbeat_stale_seconds from public.app_settings where id = 1) s
  where dp.is_online
    and dp.token is not null
    and dp.busy_trip_id is null
    and dp.last_heartbeat_at is not null
    and dp.last_heartbeat_at > now() - make_interval(secs => s.dispatch_heartbeat_stale_seconds)
    and dp.geog is not null
    and st_dwithin(dp.geog, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_radius_m)
  order by dp.token asc;
$$;

-- ── grace expiry + heartbeat-lapse cron (every minute, idempotent) ───────────
create or replace function public.expire_offline_grace()
returns void language plpgsql security definer set search_path = public as $$
declare s public.app_settings;
begin
  select * into s from public.app_settings where id = 1;
  -- 1) lapse detection: an online driver with a stale heartbeat enters grace.
  update public.driver_presence set
    is_online        = false,
    went_offline_at  = coalesce(went_offline_at, now()),
    grace_expires_at = now() + make_interval(secs => s.dispatch_offline_grace_seconds)
  where is_online
    and last_heartbeat_at is not null
    and last_heartbeat_at < now() - make_interval(secs => s.dispatch_heartbeat_stale_seconds);
  -- 2) grace expired: drop from the global queue (clear the token).
  update public.driver_presence set
    token            = null,
    grace_expires_at = null,
    went_offline_at  = null
  where not is_online
    and grace_expires_at is not null
    and grace_expires_at < now();
end $$;

grant execute on function public.driver_go_online(uuid, uuid, numeric, numeric) to service_role;
grant execute on function public.driver_heartbeat(uuid, numeric, numeric)       to service_role;
grant execute on function public.driver_go_offline(uuid)                        to service_role;
grant execute on function public.online_drivers_in_radius(numeric, numeric, numeric) to service_role;
grant execute on function public.expire_offline_grace()                          to service_role;

do $$
begin
  if not exists (select 1 from cron.job where jobname = 'presence_expire_offline_grace') then
    perform cron.schedule('presence_expire_offline_grace', '* * * * *', 'select public.expire_offline_grace()');
  end if;
end $$;

analyze public.driver_presence;
