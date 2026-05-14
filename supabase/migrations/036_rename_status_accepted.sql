-- Migration 036 — rename trips.status 'assigned' → 'accepted'.
--
-- The platform owner asked to drop "Assigned" from the vocabulary altogether.
-- The lifecycle now reads: open → has_applicants → selected → accepted →
-- in_progress → completed (cancelled is orthogonal).
--
-- Note: the COLUMN names assigned_driver_id / assigned_acceptance_id /
-- assigned_at / assigned_vehicle_id keep their names — they're FK / timestamp
-- columns, not the status enum. Only the enum value changes.

set search_path = public, pg_catalog;

-- ── 1. drop the CHECK (added by migration 030) and backfill ────────────────
alter table public.trips drop constraint if exists trips_status_check;

update public.trips set status = 'accepted' where status = 'assigned';

-- ── 2. recreate the CHECK with 'accepted' in place of 'assigned' ───────────
alter table public.trips add constraint trips_status_check
  check (status in (
    'open',
    'has_applicants',
    'selected',
    'accepted',
    'in_progress',
    'completed',
    'cancelled'
  ));

-- ── 3. refresh the helpers that hard-code 'assigned' ──────────────────────
-- get_driver_analytics (migration 017) — earnings_pending sums 'assigned' + in_progress.
create or replace function public.get_driver_analytics(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with d as (select id from public.drivers where user_id = p_user_id)
  select jsonb_build_object(
    'driver_user_id',    p_user_id,
    'has_driver_profile',(select exists (select 1 from d)),
    'trips_assigned',    (select count(*) from public.trips where assigned_driver_id in (select id from d)),
    'trips_by_status',   (select coalesce(jsonb_object_agg(status, c), '{}'::jsonb) from (select status, count(*) c from public.trips where assigned_driver_id in (select id from d) group by status) t),
    'trips_completed',   (select count(*) from public.trips where assigned_driver_id in (select id from d) and status = 'completed'),
    'earnings_total',    (select coalesce(sum(driver_payout), 0) from public.trips where assigned_driver_id in (select id from d) and status = 'completed'),
    'earnings_pending',  (select coalesce(sum(driver_payout), 0) from public.trips where assigned_driver_id in (select id from d) and status in ('accepted', 'in_progress')),
    'distance_completed_km', (select coalesce(sum(expected_distance_km), 0) from public.trips where assigned_driver_id in (select id from d) and status = 'completed'),
    'applications_total',    (select count(*) from public.trip_acceptances where driver_id in (select id from d)),
    'applications_pending',  (select count(*) from public.trip_acceptances where driver_id in (select id from d) and status = 'applied'),
    'applications_selected', (select count(*) from public.trip_acceptances where driver_id in (select id from d) and status = 'selected'),
    'reviews_received',  (select count(*) from public.reviews where ratee_user_id = p_user_id),
    'avg_review_score',  (select coalesce(round(avg(score), 2), 0) from public.reviews where ratee_user_id = p_user_id and is_published),
    'monthly', (
      select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'completed', completed, 'earnings', earnings) order by m), '[]'::jsonb)
      from (
        select m,
               (select count(*) from public.trips where assigned_driver_id in (select id from d) and status = 'completed' and date_trunc('month', created_at) = m) completed,
               (select coalesce(sum(driver_payout), 0) from public.trips where assigned_driver_id in (select id from d) and status = 'completed' and date_trunc('month', created_at) = m) earnings
        from generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') m
      ) g),
    'generated_at', now()
  );
$$;

grant execute on function public.get_driver_analytics(uuid) to authenticated, anon, service_role;

-- can_reveal_driver (migration 022) — the assigned-driver PII gate.
create or replace function public.can_reveal_driver(p_viewer uuid, p_driver_user uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_viewer is null or p_driver_user is null then false
    when p_viewer = p_driver_user then true
    when exists (select 1 from public.users where id = p_viewer and role = 'admin') then true
    when exists (
      select 1
      from public.trip_acceptances ta
      join public.drivers d on d.id = ta.driver_id and d.user_id = p_driver_user
      join public.trips    t on t.id = ta.trip_id   and t.posted_by_user_id = p_viewer
    ) then true
    when exists (
      select 1
      from public.trips t
      join public.drivers d on d.id = t.assigned_driver_id and d.user_id = p_driver_user
      where t.posted_by_user_id = p_viewer
        and t.status in ('accepted','in_progress','completed')
    ) then true
    else false
  end;
$$;
