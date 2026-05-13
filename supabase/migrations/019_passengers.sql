-- Migration 019 — passengers directory
--
-- A first-class record of every passenger phone we've ever seen on a trip.
-- The natural key is `phone` (E.164). The first poster to enter a given phone
-- becomes the canonical owner: `name`, `referred_by_user_id`, `first_trip_id`
-- and `first_seen_at` are written once and never overwritten. Later trips that
-- enter a different name for the same phone append that name to `aliases`.
--
-- Upsert path: the `trips` edge function calls this on every POST /trips (the
-- ON CONFLICT (phone) keeps the canonical row, increments `trips_count`, and
-- appends the new name to `aliases` if it differs).
--
-- RLS: admin reads all; the edge function uses the service-role key for both
-- the upsert and the reads, so the policy is admin-only on the open API.

CREATE TABLE IF NOT EXISTS public.passengers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone                 TEXT NOT NULL UNIQUE,
  name                  TEXT NOT NULL,
  aliases               TEXT[] NOT NULL DEFAULT '{}',
  referred_by_user_id   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  first_trip_id         UUID REFERENCES public.trips(id) ON DELETE SET NULL,
  first_seen_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  trips_count           INT NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- list endpoint orders by first_seen_at DESC; phone lookup is the natural key (unique already covers it)
CREATE INDEX IF NOT EXISTS passengers_first_seen_at_idx ON public.passengers (first_seen_at DESC);
CREATE INDEX IF NOT EXISTS passengers_referred_by_idx   ON public.passengers (referred_by_user_id);
-- ?q= search hits name + phone case-insensitively
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS passengers_name_trgm_idx  ON public.passengers USING gin (name  gin_trgm_ops);
CREATE INDEX IF NOT EXISTS passengers_phone_trgm_idx ON public.passengers USING gin (phone gin_trgm_ops);

-- updated_at trigger (same pattern as other tables)
DROP TRIGGER IF EXISTS passengers_set_updated_at ON public.passengers;
CREATE TRIGGER passengers_set_updated_at
  BEFORE UPDATE ON public.passengers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS — admin reads all; the edge function uses the service role for the upsert.
ALTER TABLE public.passengers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS passengers_admin_all ON public.passengers;
CREATE POLICY passengers_admin_all ON public.passengers
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- The upsert path called from POST /trips. SECURITY DEFINER so the edge function can call it
-- via the service-role client without bumping into RLS. Keeps the canonical name/referrer
-- intact; bumps trips_count; appends a differing name to aliases (deduped).
CREATE OR REPLACE FUNCTION public.upsert_passenger_from_trip(
  p_phone TEXT,
  p_name TEXT,
  p_referred_by_user_id UUID,
  p_trip_id UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.passengers (phone, name, referred_by_user_id, first_trip_id, first_seen_at, trips_count)
  VALUES (p_phone, p_name, p_referred_by_user_id, p_trip_id, now(), 1)
  ON CONFLICT (phone) DO UPDATE
    SET trips_count = public.passengers.trips_count + 1,
        aliases = CASE
          WHEN EXCLUDED.name = public.passengers.name OR EXCLUDED.name = ANY(public.passengers.aliases)
            THEN public.passengers.aliases
          ELSE array_append(public.passengers.aliases, EXCLUDED.name)
        END,
        updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_passenger_from_trip(TEXT, TEXT, UUID, UUID) TO service_role;

ANALYZE public.passengers;
