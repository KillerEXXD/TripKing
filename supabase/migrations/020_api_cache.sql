-- TripKing — migration 020: shared response cache (Phase 1 of the caching strategy, see
-- docs/CACHE_BASELINE.md). The edge functions check an in-memory cache first (per-instance,
-- `_shared/cache.ts`) and fall back to this table (shared across all Deno isolates) before
-- doing the real work. The wrapper that ties them together is `_shared/withCache.ts`.
--
-- Design choices vs the TournamentPro reference (supabase/functions/_shared/shared-cache.ts):
--   • Single `entity_kind TEXT` + `entity_id TEXT` pair for polymorphic bulk invalidation,
--     instead of a column per FK target. Simpler indexes and one invalidation pattern across
--     trips / drivers / agents / vehicles / users.
--   • `cache_type TEXT` (not an enum) — TripKing's lookup-table doctrine: enums grow at code
--     speed; TEXT + CHECK or a separate lookup table grows at admin speed. Cache categories
--     are a deploy-time concern, so a plain TEXT with a CHECK is the cheapest fit.
--   • RLS — admin-only (consistent with api_metrics).
--
-- pg_cron runs in the `postgres` database (Supabase default); the cleanup job mirrors
-- rate-limits-cleanup (013) and api-metrics-cleanup (018).

create extension if not exists pg_cron;

create table if not exists public.api_cache (
  cache_key   text primary key,
  cache_type  text not null check (cache_type in (
    'admin',         -- master / reference data
    'profile',       -- driver, agent, vehicle public profiles
    'live',          -- marketplace lists (trips, vacancies, applicants)
    'private',       -- per-user inboxes / me-endpoints
    'analytics',     -- expensive aggregations
    'computed'       -- single-row computed values (app_settings, eligibility, etc.)
  )),
  data        jsonb not null,
  entity_kind text,                                       -- e.g. 'driver', 'trip', 'agent', 'vehicle', 'user', 'admin'
  entity_id   text,                                       -- nullable for cross-cutting entries (admin lookup lists)
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  hit_count   integer not null default 0,
  last_hit_at timestamptz
);

comment on table public.api_cache is 'Phase-1 shared response cache for edge functions. See docs/CACHE_BASELINE.md.';

-- updated_at trigger (matches the project-wide convention)
create or replace function public.api_cache_set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_api_cache_updated_at on public.api_cache;
create trigger trg_api_cache_updated_at before update on public.api_cache
  for each row execute function public.api_cache_set_updated_at();

create index if not exists idx_api_cache_expires_at on public.api_cache (expires_at);
create index if not exists idx_api_cache_type on public.api_cache (cache_type);
create index if not exists idx_api_cache_entity on public.api_cache (entity_kind, entity_id) where entity_kind is not null;

-- Atomic hit-count bump; called by sharedCache.ts on every hit.
create or replace function public.api_cache_record_hit(p_key text) returns void
  language sql security definer as $$
  update public.api_cache
     set hit_count   = hit_count + 1,
         last_hit_at = now()
   where cache_key = p_key
$$;

-- Cleanup function used by the cron + ad-hoc by admins.
create or replace function public.api_cache_cleanup_expired() returns integer
  language plpgsql security definer as $$
declare n integer;
begin
  delete from public.api_cache where expires_at < now();
  get diagnostics n = row_count;
  return n;
end $$;

-- Hourly cron sweep — small table, cheap query, keeps it tight.
select cron.schedule(
  'api-cache-cleanup',
  '37 * * * *',                                           -- :37 every hour (offset from the other crons)
  $$select public.api_cache_cleanup_expired()$$
);

-- RLS — admin-only (the edge functions use the service-role key, which bypasses RLS).
alter table public.api_cache enable row level security;

drop policy if exists api_cache_admin_select on public.api_cache;
create policy api_cache_admin_select on public.api_cache for select
  using (public.is_admin());

drop policy if exists api_cache_admin_all on public.api_cache;
create policy api_cache_admin_all on public.api_cache for all
  using (public.is_admin()) with check (public.is_admin());

-- Admin dashboard rollup — what's actually being cached + how warm it is.
create or replace view public.api_cache_stats as
  select
    cache_type,
    count(*)                                                  as entries,
    sum(hit_count)                                            as total_hits,
    round(avg(hit_count)::numeric, 1)                         as avg_hits_per_entry,
    sum(case when expires_at < now() then 1 else 0 end)       as expired,
    pg_size_pretty(sum(pg_column_size(data))::bigint)         as data_size,
    min(created_at)                                           as oldest,
    max(updated_at)                                           as newest
  from public.api_cache
  group by cache_type;

grant select on public.api_cache_stats to postgres;

analyze public.api_cache;
