-- TripKing — migration 005: Phase-6 hardening — a fixed-window rate limiter + an api_metrics table.
-- Both tables are service-role-only (the edge functions touch them with the service-role key);
-- RLS is enabled with no policies so the anon/authenticated keys see nothing.

-- ── rate limiting ────────────────────────────────────────────────────────────
create table public.rate_limits (
  bucket        text primary key,            -- e.g. 'verify-otp:919900123456'
  window_start  timestamptz not null default now(),
  count         integer not null default 0,
  updated_at    timestamptz not null default now()
);
alter table public.rate_limits enable row level security;
create index idx_rate_limits_updated on public.rate_limits (updated_at);   -- for periodic cleanup of stale buckets

-- Atomic check-and-increment for one bucket. Returns TRUE if the request is ALLOWED
-- (≤ p_max calls within the rolling p_window_sec window); FALSE if it should be rejected.
create or replace function public.check_rate_limit(p_bucket text, p_max integer, p_window_sec integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
  v_cutoff timestamptz := now() - make_interval(secs => p_window_sec);
begin
  insert into public.rate_limits (bucket, window_start, count) values (p_bucket, now(), 1)
  on conflict (bucket) do update set
    window_start = case when public.rate_limits.window_start < v_cutoff then now() else public.rate_limits.window_start end,
    count        = case when public.rate_limits.window_start < v_cutoff then 1   else public.rate_limits.count + 1 end,
    updated_at   = now()
  returning count into v_count;
  return v_count <= p_max;
end;
$$;
grant execute on function public.check_rate_limit(text, integer, integer) to authenticated, anon, service_role;

-- ── api_metrics — withTiming() persists one row per request (fire-and-forget) ─
create table public.api_metrics (
  id            uuid primary key default gen_random_uuid(),
  endpoint      text not null,               -- the withTiming name, e.g. 'trips'
  method        text not null,
  status        integer not null,
  duration_ms   integer not null,
  created_at    timestamptz not null default now()
);
alter table public.api_metrics enable row level security;
create index idx_api_metrics_endpoint_created on public.api_metrics (endpoint, created_at desc);
create index idx_api_metrics_created on public.api_metrics (created_at);

analyze;
