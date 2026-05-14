-- Phase 6 of the trip-assignment handshake — telemetry.
--
-- A single admin-only SQL function that rolls up the counters product cares about
-- (`docs/TRIP_ASSIGNMENT_WORKFLOW.md`):
--   * time-to-accept (median + p95, in seconds) once the driver Accepts
--   * accept-rate / decline-rate / expiry-rate among trips that reached `selected`
--   * invite outcomes — how many `pending` / `applied` / `declined` / `withdrawn` / `expired`
--
-- No new tables — every signal is already in `trips` + `trip_invitations`. We can add
-- a materialised view later if this becomes hot; for now the dataset is small enough
-- to compute on demand (and `/analytics/admin` caches the response anyway).

create or replace function public.get_handshake_metrics(p_days int default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_since timestamptz := now() - make_interval(days => greatest(p_days, 1));
  v_result jsonb;
begin
  with selected_trips as (
    -- every trip that reached `selected` in the window (assigned/in_progress/completed
    -- count as "accepted" — `driver_acceptance_status` was set by the /accept handler)
    select id, status, driver_acceptance_status, acceptance_deadline_at, assigned_at, created_at
    from public.trips
    where created_at >= v_since
      and driver_acceptance_status is not null
  ),
  accept_latency as (
    select extract(epoch from (assigned_at - (acceptance_deadline_at - (acceptance_window_minutes || ' minutes')::interval)))::int as secs
    from public.trips
    where created_at >= v_since
      and driver_acceptance_status = 'accepted'
      and assigned_at is not null
      and acceptance_deadline_at is not null
  ),
  outcomes as (
    select
      count(*) filter (where driver_acceptance_status = 'accepted') as accepted,
      count(*) filter (where driver_acceptance_status = 'declined') as declined,
      count(*) filter (where driver_acceptance_status = 'expired')  as expired,
      count(*) filter (where driver_acceptance_status = 'pending')  as pending,
      count(*) as total
    from selected_trips
  ),
  invites as (
    select
      count(*) filter (where status = 'pending')   as pending,
      count(*) filter (where status = 'applied')   as applied,
      count(*) filter (where status = 'declined')  as declined,
      count(*) filter (where status = 'withdrawn') as withdrawn,
      count(*) filter (where status = 'expired')   as expired,
      count(*) as total
    from public.trip_invitations
    where created_at >= v_since
  )
  select jsonb_build_object(
    'window_days', p_days,
    'since',       v_since,
    'selection_outcomes', (select to_jsonb(outcomes.*) from outcomes),
    'time_to_accept_seconds', jsonb_build_object(
      'count',  (select count(*) from accept_latency),
      'median', (select percentile_cont(0.5) within group (order by secs) from accept_latency),
      'p95',    (select percentile_cont(0.95) within group (order by secs) from accept_latency),
      'avg',    (select round(avg(secs))      from accept_latency)
    ),
    'invite_outcomes', (select to_jsonb(invites.*) from invites)
  )
  into v_result;
  return v_result;
end;
$$;

revoke all on function public.get_handshake_metrics(int) from public;
grant execute on function public.get_handshake_metrics(int) to authenticated, service_role;

comment on function public.get_handshake_metrics(int) is
  'Phase-6 handshake telemetry — accept/decline/expire counts, time-to-accept percentiles, invite outcomes. Admin-only via /analytics/handshake.';
