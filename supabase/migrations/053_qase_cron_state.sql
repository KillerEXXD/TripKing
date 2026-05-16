-- 053: Watermark table for /cron-qase-poll.
--
-- The polling fallback (used when the Qase project plan doesn't expose webhooks)
-- needs to remember the most-recently-seen defect id / updated_at, so each poll
-- only fetches NEW or CHANGED defects instead of re-walking the entire defect
-- list. One row per cron job, keyed by `job_name`.
--
-- Tiny + serialised — we expect ≤5 jobs ever to write here, low contention.

CREATE TABLE IF NOT EXISTS public.cron_state (
  job_name           TEXT PRIMARY KEY,
  last_seen_id       BIGINT,
  last_seen_at       TIMESTAMPTZ,
  last_run_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_run_summary   JSONB,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.cron_state_touch() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cron_state_set_updated_at ON public.cron_state;
CREATE TRIGGER cron_state_set_updated_at
  BEFORE UPDATE ON public.cron_state
  FOR EACH ROW EXECUTE FUNCTION public.cron_state_touch();

-- Admin-only read (service role bypasses anyway).
ALTER TABLE public.cron_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cron_state_admin_read ON public.cron_state;
CREATE POLICY cron_state_admin_read ON public.cron_state FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'));

COMMENT ON TABLE public.cron_state IS
  'Tiny key-value store for cron-job watermarks. The /cron-qase-poll fn writes its last_seen_id here so subsequent polls only fetch new Qase defects.';
