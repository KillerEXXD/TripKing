-- 026 — Trigram indexes for admin name/phone/email search on drivers + trip_managers.
-- drivers.full_name already has idx_drivers_name_trgm (migration 002).
-- Phone/email are short-ish strings; trigram ILIKE handles partial matches.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_drivers_phone_trgm
  ON public.drivers USING gin (phone gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_drivers_email_trgm
  ON public.drivers USING gin (email gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_trip_managers_name_trgm
  ON public.trip_managers USING gin (full_name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_trip_managers_phone_trgm
  ON public.trip_managers USING gin (phone gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_trip_managers_email_trgm
  ON public.trip_managers USING gin (email gin_trgm_ops);

ANALYZE public.drivers;
ANALYZE public.trip_managers;
