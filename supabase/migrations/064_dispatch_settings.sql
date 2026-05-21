-- Dispatch algorithm toggle + tunables (PR1 schema; BEHAVIOUR-NEUTRAL).
--
-- Adds the platform-wide dispatch algorithm switch and the Auto-dispatch tuning
-- knobs to the single-row app_settings. Ships defaulting to 'manual' so deploy
-- changes NOTHING (all current trips are manual); the admin flips to 'auto'
-- later, after briefing QA. See docs/DISPATCH_IMPLEMENTATION_PLAN.md.
--
-- 'auto'   → "I'm Online" presence + token-queue + 60s offers (no applicants).
-- 'manual' → today's "I'm vacant" + apply + agent-picks (unchanged).

alter table public.app_settings
  add column if not exists dispatch_algorithm               text    not null default 'manual' check (dispatch_algorithm in ('auto','manual')),
  add column if not exists dispatch_offer_seconds           integer not null default 60   check (dispatch_offer_seconds between 15 and 300),
  add column if not exists dispatch_offline_grace_seconds   integer not null default 180  check (dispatch_offline_grace_seconds between 30 and 1800),
  add column if not exists dispatch_initial_radius_km       numeric not null default 3    check (dispatch_initial_radius_km between 1 and 100),
  add column if not exists dispatch_radius_widen_km         numeric not null default 10   check (dispatch_radius_widen_km between 0 and 100),
  add column if not exists dispatch_max_passes              integer not null default 2    check (dispatch_max_passes between 1 and 5),
  add column if not exists dispatch_retry_cooldown_seconds  integer not null default 120  check (dispatch_retry_cooldown_seconds between 30 and 3600),
  add column if not exists dispatch_max_retries             integer not null default 3    check (dispatch_max_retries between 0 and 20),
  add column if not exists dispatch_heartbeat_stale_seconds integer not null default 90   check (dispatch_heartbeat_stale_seconds between 30 and 600);

analyze public.app_settings;
