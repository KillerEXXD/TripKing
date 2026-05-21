-- Auto-dispatch engine (PR5). Reuses the proven two-step selection handshake:
-- the engine auto-SELECTS the next online driver (by global token, within radius)
-- with a short acceptance deadline; the driver accepts via the existing
-- POST /trips/:id/accept (OTP + assignment unchanged). On miss/decline the engine
-- advances to the next driver; exhausting the radius widens, then a cooldown +
-- auto-retry, then Unfilled. See docs/DISPATCH_IMPLEMENTATION_PLAN.md.
--
-- Only acts on trips with dispatch_mode='auto' (frozen at POST). Manual trips are
-- untouched (the legacy applicants/invite flow + expire_stale_selections still run).

-- notifications.type gains the auto-dispatch types.
alter table public.notifications drop constraint if exists notifications_type_check;
do $$
declare allowed text;
begin
  select string_agg(quote_literal(t), ', ') into allowed from (
    select distinct type as t from public.notifications
    union select unnest(array[
      'alert_match','kyc_status_change','trip_assigned','trip_cancelled','trip_completed','review_received',
      'trip_selected','trip_unfilled','account_status_change','trip_updated'
    ])
  ) s;
  execute format('alter table public.notifications add constraint notifications_type_check check (type in (%s))', allowed);
end $$;

-- Resolve a trip's pickup point (from_city lat/lng).
create or replace function public.dispatch_pickup_point(p_trip uuid)
returns table(lat numeric, lng numeric)
language sql stable security definer set search_path = public as $$
  select c.lat, c.lng
  from public.trips t join public.cities c on c.id = t.from_city_id
  where t.id = p_trip;
$$;

-- The engine. Locks the trip; expires a lapsed offer; selects the next eligible
-- online driver (token order, radius gate, no live offer elsewhere, not yet
-- offered this pass) via an upserted 'selected' acceptance + the selection
-- columns the existing /accept path consumes; widens / retries / marks unfilled.
create or replace function public.advance_dispatch(p_trip uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  t        public.trips;
  s        public.app_settings;
  pk       record;
  cand     record;
  v_vehicle uuid;
  v_acc    uuid;
  v_radius_m numeric;
begin
  select * into t from public.trips where id = p_trip for update skip locked;
  if not found then return; end if;
  if t.dispatch_mode <> 'auto' then return; end if;
  if t.dispatch_status in ('filled','unfilled') or t.status in ('assigned','in_progress','completed','cancelled') then return; end if;

  select * into s from public.app_settings where id = 1;

  -- Expire a lapsed live offer before re-selecting.
  if t.dispatch_status = 'offering' and t.offer_deadline_at is not null and t.offer_deadline_at <= now() then
    update public.trip_offers set status = 'missed', responded_at = now()
      where trip_id = p_trip and driver_id = t.current_offer_driver_id and status = 'offered';
    update public.trip_acceptances set status = 'expired', decision_at = now()
      where trip_id = p_trip and driver_id = t.current_offer_driver_id and status = 'selected';
    update public.trips set
      status = 'open', assigned_driver_id = null, assigned_vehicle_id = null,
      assigned_acceptance_id = null, assigned_at = null, acceptance_deadline_at = null,
      driver_acceptance_status = null, current_offer_driver_id = null, current_offer_token = null,
      offer_deadline_at = null
    where id = p_trip;
    t.current_offer_driver_id := null;
  elsif t.dispatch_status = 'offering' then
    return; -- a live offer is still ticking; nothing to do
  end if;

  v_radius_m := coalesce(t.current_radius_km, s.dispatch_initial_radius_km) * 1000;
  select * into pk from public.dispatch_pickup_point(p_trip);
  if pk.lat is null then
    update public.trips set dispatch_status = 'unfilled' where id = p_trip;
    return;
  end if;

  -- Next eligible driver: online + in radius (token order), not yet offered this
  -- pass, not the live offer of another trip (one offer at a time), not the poster.
  select d.driver_id, d.token into cand
  from public.online_drivers_in_radius(pk.lat, pk.lng, v_radius_m) d
  where not exists (
    select 1 from public.trip_offers o
    where o.trip_id = p_trip and o.driver_id = d.driver_id and o.pass_number = t.pass_number
  )
  and not exists (
    select 1 from public.trips t2
    where t2.id <> p_trip and t2.dispatch_status = 'offering'
      and t2.current_offer_driver_id = d.driver_id and t2.offer_deadline_at > now()
  )
  and not exists (
    select 1 from public.drivers dr where dr.id = d.driver_id and dr.user_id = t.posted_by_user_id
  )
  order by d.token asc
  limit 1;

  if found then
    select coalesce(
      (select vehicle_id from public.driver_presence where driver_id = cand.driver_id),
      (select id from public.vehicles where driver_id = cand.driver_id and is_active and is_primary limit 1),
      (select id from public.vehicles where driver_id = cand.driver_id and is_active limit 1)
    ) into v_vehicle;

    insert into public.trip_acceptances (trip_id, driver_id, vehicle_id, status, applied_at, decision_at)
    values (p_trip, cand.driver_id, v_vehicle, 'selected', now(), now())
    on conflict (trip_id, driver_id) do update set status = 'selected', vehicle_id = excluded.vehicle_id, decision_at = now()
    returning id into v_acc;

    insert into public.trip_offers (trip_id, driver_id, token_at_offer, pass_number, offered_at, deadline_at, status)
    values (p_trip, cand.driver_id, cand.token, t.pass_number, now(), now() + make_interval(secs => s.dispatch_offer_seconds), 'offered');

    update public.trips set
      status = 'selected', assigned_driver_id = cand.driver_id, assigned_vehicle_id = v_vehicle,
      assigned_acceptance_id = v_acc, assigned_at = now(),
      acceptance_deadline_at = now() + make_interval(secs => s.dispatch_offer_seconds),
      driver_acceptance_status = 'pending', dispatch_status = 'offering',
      current_offer_driver_id = cand.driver_id, current_offer_token = cand.token,
      offer_deadline_at = now() + make_interval(secs => s.dispatch_offer_seconds)
    where id = p_trip;

    insert into public.notifications (user_id, type, title, body, payload_json)
    select dr.user_id, 'trip_selected', 'New trip offer', 'A trip near you — accept within '
      || s.dispatch_offer_seconds || ' seconds.', jsonb_build_object('trip_id', p_trip)
    from public.drivers dr where dr.id = cand.driver_id;
    return;
  end if;

  -- No candidate in the current radius → widen, then cooldown+retry, then unfilled.
  if t.pass_number + 1 < s.dispatch_max_passes then
    update public.trips set
      pass_number = t.pass_number + 1, dispatch_status = 'widening',
      current_radius_km = coalesce(t.current_radius_km, s.dispatch_initial_radius_km) + s.dispatch_radius_widen_km
    where id = p_trip;
    perform public.advance_dispatch(p_trip);  -- immediately try the wider ring
  elsif t.retry_count < s.dispatch_max_retries then
    update public.trips set
      dispatch_status = 'waiting', retry_count = t.retry_count + 1,
      next_retry_at = now() + make_interval(secs => s.dispatch_retry_cooldown_seconds),
      pass_number = 0, current_radius_km = s.dispatch_initial_radius_km
    where id = p_trip;
  else
    update public.trips set dispatch_status = 'unfilled', status = 'open' where id = p_trip;
    insert into public.notifications (user_id, type, title, body, payload_json)
    values (t.posted_by_user_id, 'trip_unfilled', 'No driver found yet',
      'No driver accepted your trip. Re-broadcast or adjust the fare.', jsonb_build_object('trip_id', p_trip));
  end if;
end $$;

create or replace function public.start_dispatch(p_trip uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s public.app_settings;
begin
  select * into s from public.app_settings where id = 1;
  update public.trips set
    dispatch_status = 'searching', current_radius_km = s.dispatch_initial_radius_km,
    pass_number = 0, retry_count = 0, next_retry_at = null
  where id = p_trip and dispatch_mode = 'auto';
  perform public.advance_dispatch(p_trip);
end $$;

-- Cron: advance auto trips whose offer lapsed, and kick off due retries.
create or replace function public.dispatch_tick()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  -- lapsed live offers
  for r in select id from public.trips
    where dispatch_mode = 'auto' and dispatch_status = 'offering'
      and offer_deadline_at is not null and offer_deadline_at <= now()
  loop perform public.advance_dispatch(r.id); end loop;
  -- due retries (waiting → re-scan)
  for r in select id from public.trips
    where dispatch_mode = 'auto' and dispatch_status = 'waiting'
      and next_retry_at is not null and next_retry_at <= now()
  loop perform public.advance_dispatch(r.id); end loop;
  -- searching/widening that stalled (no viewer ever read them)
  for r in select id from public.trips
    where dispatch_mode = 'auto' and dispatch_status in ('searching','widening')
  loop perform public.advance_dispatch(r.id); end loop;
end $$;

-- Keep the manual selection-expiry cron OFF auto trips (the engine owns those).
-- Faithful copy of migration 031's function + a single `dispatch_mode <> 'auto'` guard.
create or replace function public.expire_stale_selections() returns void
language plpgsql security definer set search_path = public as $$
declare expired_count int;
begin
  update public.trip_acceptances
     set status = 'expired', decision_at = now()
   where id in (
     select t.assigned_acceptance_id from public.trips t
      where t.status = 'selected' and t.acceptance_deadline_at is not null
        and t.acceptance_deadline_at < now() and t.assigned_acceptance_id is not null
        and coalesce(t.dispatch_mode, 'manual') <> 'auto'
   );

  with stale as (
    select t.id from public.trips t
     where t.status = 'selected' and t.acceptance_deadline_at is not null
       and t.acceptance_deadline_at < now() and coalesce(t.dispatch_mode, 'manual') <> 'auto'
  )
  update public.trips t
     set status = case when (select count(*) from public.trip_acceptances ta
                              where ta.trip_id = t.id and ta.status = 'applied') > 0
                       then 'has_applicants' else 'open' end,
         assigned_driver_id = null, assigned_vehicle_id = null, assigned_acceptance_id = null,
         assigned_at = null, acceptance_deadline_at = null, driver_acceptance_status = 'expired'
   where t.id in (select id from stale);

  get diagnostics expired_count = row_count;
  if expired_count > 0 then
    raise notice 'expire_stale_selections: % trip(s) reset (manual only)', expired_count;
  end if;
end;
$$;

grant execute on function public.advance_dispatch(uuid)  to service_role;
grant execute on function public.start_dispatch(uuid)    to service_role;
grant execute on function public.dispatch_tick()         to service_role;
grant execute on function public.dispatch_pickup_point(uuid) to service_role;

do $$ begin
  if not exists (select 1 from cron.job where jobname = 'dispatch_tick') then
    perform cron.schedule('dispatch_tick', '* * * * *', 'select public.dispatch_tick()');
  end if;
end $$;

analyze public.trips;
