-- Migration 038 — DB housekeeping after the 037 migrations.
--
-- 1. ANALYZE the three tables whose row distributions changed materially:
--    - trip_acceptances: 037_acceptance_row_accepted flipped ~102 rows from
--      'selected' → 'accepted'; the planner's histogram for the `status` column
--      is stale.
--    - trips: same era — migration 036 renamed `assigned` → `accepted`, plus
--      migration 037_backfill_trip_poster_pii touched a handful of rows.
--    - trip_managers: 037_backfill_trip_poster_pii populated phone/email on
--      the trip_managers rows referenced by trips.posted_by_user_id.
--
-- 2. Drop `idx_api_metrics_cache_status` — pg_stat_user_indexes shows 0 scans
--    since creation (verified 2026-05-15). 96 kB index + write overhead on
--    every api_metrics insert for no read benefit. Sibling index
--    `idx_api_metrics_endpoint_created` has 1 scan and stays.

drop index if exists public.idx_api_metrics_cache_status;

analyze public.trip_acceptances;
analyze public.trips;
analyze public.trip_managers;
