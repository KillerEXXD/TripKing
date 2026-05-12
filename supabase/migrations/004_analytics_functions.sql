-- TripKing — migration 004: server-computed analytics (Phase 5).
-- Two SECURITY DEFINER read functions returning a single jsonb blob each — called by the
-- `/analytics` edge function (which does the auth: admin-only for the platform dashboard,
-- self-or-admin for an agent's analytics). SECURITY DEFINER + search_path=public per the
-- migration-001/002 convention. No row-fetch caps (the function aggregates in SQL).

-- ── platform dashboard (admin) ───────────────────────────────────────────────
create or replace function public.get_admin_dashboard()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'users_total',   (select count(*) from public.users),
    'users_by_role', (select coalesce(jsonb_object_agg(role, c), '{}'::jsonb) from (select role, count(*) c from public.users group by role) t),
    'drivers_total', (select count(*) from public.drivers),
    'drivers_by_kyc',(select coalesce(jsonb_object_agg(kyc_status, c), '{}'::jsonb) from (select kyc_status, count(*) c from public.drivers group by kyc_status) t),
    'agents_total',  (select count(*) from public.trip_managers),
    'agents_by_kyc', (select coalesce(jsonb_object_agg(kyc_status, c), '{}'::jsonb) from (select kyc_status, count(*) c from public.trip_managers group by kyc_status) t),
    'vehicles_total',(select count(*) from public.vehicles where is_active),
    'vehicles_by_eligibility', (
      select coalesce(jsonb_object_agg(status, c), '{}'::jsonb) from (
        select case when v.year < s.min_vehicle_year then 'expired'
                    when v.year < s.min_vehicle_year + 1 then 'expiring_soon'
                    else 'eligible' end as status, count(*) c
        from public.vehicles v cross join (select min_vehicle_year from public.app_settings where id = 1) s
        where v.is_active group by 1) t),
    'trips_total',   (select count(*) from public.trips),
    'trips_by_status',(select coalesce(jsonb_object_agg(status, c), '{}'::jsonb) from (select status, count(*) c from public.trips group by status) t),
    'fare_completed_total',       (select coalesce(sum(total_fare), 0) from public.trips where status = 'completed'),
    'commission_completed_total', (select coalesce(round(sum(total_fare * commission_pct / 100.0), 2), 0) from public.trips where status = 'completed'),
    'driver_payout_completed_total', (select coalesce(sum(driver_payout), 0) from public.trips where status = 'completed'),
    'vacancies_by_status', (select coalesce(jsonb_object_agg(status, c), '{}'::jsonb) from (select status, count(*) c from public.vacancies group by status) t),
    'alerts_active',  (select count(*) from public.alerts where is_active),
    'reviews_total',  (select count(*) from public.reviews),
    'reviews_flagged',(select count(*) from public.reviews where is_flagged),
    'notifications_unread', (select count(*) from public.notifications where not is_read),
    'trips_monthly', (
      select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'posted', posted, 'completed', completed) order by m), '[]'::jsonb)
      from (
        select m,
               (select count(*) from public.trips where date_trunc('month', created_at) = m) posted,
               (select count(*) from public.trips where status = 'completed' and date_trunc('month', created_at) = m) completed
        from generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') m
      ) g),
    'generated_at',   now()
  );
$$;

-- ── one agent's analytics ────────────────────────────────────────────────────
create or replace function public.get_agent_analytics(p_user_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'agent_user_id', p_user_id,
    'trips_posted',  (select count(*) from public.trips where posted_by_user_id = p_user_id),
    'trips_by_status',(select coalesce(jsonb_object_agg(status, c), '{}'::jsonb) from (select status, count(*) c from public.trips where posted_by_user_id = p_user_id group by status) t),
    'fare_posted_total',    (select coalesce(sum(total_fare), 0) from public.trips where posted_by_user_id = p_user_id),
    'fare_completed_total', (select coalesce(sum(total_fare), 0) from public.trips where posted_by_user_id = p_user_id and status = 'completed'),
    'driver_payout_completed_total', (select coalesce(sum(driver_payout), 0) from public.trips where posted_by_user_id = p_user_id and status = 'completed'),
    'avg_rate_per_km',      (select coalesce(round(avg(rate_per_km), 2), 0) from public.trips where posted_by_user_id = p_user_id),
    'applicants_received_total', (select coalesce(sum(applicant_count), 0) from public.trips where posted_by_user_id = p_user_id),
    'unique_drivers_assigned',   (select count(distinct assigned_driver_id) from public.trips where posted_by_user_id = p_user_id and assigned_driver_id is not null),
    'reviews_received', (select count(*) from public.reviews where ratee_user_id = p_user_id),
    'avg_review_score', (select coalesce(round(avg(score), 2), 0) from public.reviews where ratee_user_id = p_user_id and is_published),
    'monthly', (
      select coalesce(jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'), 'posted', posted, 'completed', completed) order by m), '[]'::jsonb)
      from (
        select m,
               (select count(*) from public.trips where posted_by_user_id = p_user_id and date_trunc('month', created_at) = m) posted,
               (select count(*) from public.trips where posted_by_user_id = p_user_id and status = 'completed' and date_trunc('month', created_at) = m) completed
        from generate_series(date_trunc('month', now()) - interval '5 months', date_trunc('month', now()), interval '1 month') m
      ) g),
    'generated_at', now()
  );
$$;

grant execute on function public.get_admin_dashboard() to authenticated, anon, service_role;
grant execute on function public.get_agent_analytics(uuid) to authenticated, anon, service_role;
