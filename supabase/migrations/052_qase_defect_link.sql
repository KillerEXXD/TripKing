-- 052: Link bug_reports → Qase Defects (idempotent webhook ingest).
--
-- The `webhook-qase` edge function receives Qase "defect.created" payloads
-- and upserts a bug_reports row. We store the Qase defect id on the row so
-- re-deliveries (Qase retries on 5xx) don't create duplicates, and so a
-- later "defect.resolved" update can find the row to update.
--
-- Nullable + UNIQUE: most bug_reports rows (user-filed) have NULL here;
-- only QA-bot-filed rows are populated. The partial unique index on the
-- non-null subset gives us idempotency without forcing the column on
-- ordinary inserts.

ALTER TABLE public.bug_reports
  ADD COLUMN IF NOT EXISTS qase_defect_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS bug_reports_qase_defect_id_uniq
  ON public.bug_reports (qase_defect_id)
  WHERE qase_defect_id IS NOT NULL;

COMMENT ON COLUMN public.bug_reports.qase_defect_id IS
  'Set by the webhook-qase edge fn on Qase defect.created events. NULL for user-filed bugs. The partial unique index guarantees idempotent re-ingest.';

ANALYZE public.bug_reports;
