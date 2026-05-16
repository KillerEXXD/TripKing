-- 050_referral_fraud.sql
-- Stage 9 of the referral program. Adds:
--   * referral_fraud_flags table — auto + manual flags per referral_link
--   * users.signup_fingerprint TEXT (STUB; populated as future work — the device-
--     fingerprint capture pipeline isn't built yet)
--   * detect_duplicate_aadhaar / detect_duplicate_upi / detect_same_pair_pattern /
--     detect_signup_velocity helpers — read fraud_settings thresholds (Stage 5)
--   * Trigger on referral_links AFTER UPDATE OF status='qualified'/'earning_active'
--     → run all detectors → for each violation, insert a referral_fraud_flag row
--     and apply the action from fraud_action_rules (Stage 5):
--     - flag_only: just the flag row, no link change
--     - hold_earnings: no debit but mark suspended
--     - suspend_link: status → suspended
--     - block_withdrawal: TODO Stage 7 hook (not blocking accrual, just future
--       withdrawals — implemented at the request_referral_withdrawal stored proc
--       reading users.is_high_risk; cheap stub here)
--   * users.is_high_risk BOOLEAN — admin can flip to extend hold periods
--   * reverse_referral_earnings(_link_id, _admin_actor_id, _note) stored proc —
--     inserts a 'reversal' ledger entry for the link's full earned amount,
--     restoring funds (negative impact on R's withdrawable)
--
-- Spec: docs/REFERRAL_PROGRAM_REQUIREMENTS.md §19 (fraud) + §13 (statuses).
-- Plan: docs/REFERRAL_IMPLEMENTATION_PLAN.md Stage 9.

------------------------------------------------------------------------------
-- 1. Stub fingerprint column on users + risk flag
------------------------------------------------------------------------------

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS signup_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS is_high_risk       BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS users_signup_fingerprint_idx
  ON public.users (signup_fingerprint)
  WHERE signup_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS users_high_risk_idx
  ON public.users (id) WHERE is_high_risk;

COMMENT ON COLUMN public.users.signup_fingerprint IS
  'STUB (Stage 9). The device-fingerprint capture pipeline (browser/mobile fingerprinting library) is future work; column is here so the duplicate-device detector can light up the moment fingerprints start landing.';
COMMENT ON COLUMN public.users.is_high_risk IS
  'Admin-flipped flag (Stage 9). Extends withdrawal_hold_days by fraud_settings.high_risk_extra_hold_days for this user. Wired in Stage 7 stored proc on the next withdrawal-flow tweak.';

------------------------------------------------------------------------------
-- 2. referral_fraud_flags
------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.referral_fraud_flags (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_link_id    UUID NOT NULL REFERENCES public.referral_links(id) ON DELETE CASCADE,
  flag_type           TEXT NOT NULL CHECK (flag_type IN (
                        'duplicate_aadhaar', 'duplicate_upi', 'duplicate_device',
                        'self_referral', 'suspicious_trip_pattern',
                        'high_risk_user', 'manual_review'
                      )),
  severity            TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  auto_detected       BOOLEAN NOT NULL DEFAULT true,
  action_taken        TEXT          CHECK (action_taken IN ('flag_only', 'hold_earnings', 'suspend_link', 'block_withdrawal')),
  detail              JSONB,        -- e.g. {"matches": [{"user_id": "..."}, ...]}
  note                TEXT,
  created_by          UUID REFERENCES public.users(id) ON DELETE SET NULL,  -- NULL on auto
  resolved_at         TIMESTAMPTZ,
  resolved_by         UUID REFERENCES public.users(id) ON DELETE SET NULL,
  resolved_note       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referral_fraud_flags_link_idx     ON public.referral_fraud_flags (referral_link_id, created_at DESC);
CREATE INDEX IF NOT EXISTS referral_fraud_flags_type_sev_idx ON public.referral_fraud_flags (flag_type, severity);
CREATE INDEX IF NOT EXISTS referral_fraud_flags_unresolved_idx
  ON public.referral_fraud_flags (created_at DESC) WHERE resolved_at IS NULL;

CREATE OR REPLACE FUNCTION public.touch_referral_fraud_flags_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS referral_fraud_flags_touch ON public.referral_fraud_flags;
CREATE TRIGGER referral_fraud_flags_touch BEFORE UPDATE ON public.referral_fraud_flags
  FOR EACH ROW EXECUTE FUNCTION public.touch_referral_fraud_flags_updated_at();

ALTER TABLE public.referral_fraud_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS referral_fraud_flags_admin_only ON public.referral_fraud_flags;
CREATE POLICY referral_fraud_flags_admin_only ON public.referral_fraud_flags
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

------------------------------------------------------------------------------
-- 3. Detection helpers (each returns the matching context as JSONB or NULL)
------------------------------------------------------------------------------

-- (a) Duplicate Aadhaar: the referred user's masked Aadhaar appears on N+ accounts.
CREATE OR REPLACE FUNCTION public.detect_duplicate_aadhaar(_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE AS $$
DECLARE
  threshold INT;
  my_mask TEXT;
  matches JSONB;
  cnt INT;
BEGIN
  SELECT duplicate_aadhaar_threshold INTO threshold FROM public.fraud_settings WHERE id = 1;
  IF threshold IS NULL THEN RETURN NULL; END IF;

  -- Pull the user's masked Aadhaar from drivers OR trip_managers
  SELECT COALESCE(d.aadhaar_number_masked, tm.aadhaar_number_masked) INTO my_mask
    FROM public.users u
    LEFT JOIN public.drivers       d  ON d.user_id  = u.id
    LEFT JOIN public.trip_managers tm ON tm.user_id = u.id
   WHERE u.id = _user_id LIMIT 1;
  IF my_mask IS NULL OR length(my_mask) = 0 THEN RETURN NULL; END IF;

  SELECT COUNT(*), jsonb_agg(jsonb_build_object('user_id', uid)) INTO cnt, matches FROM (
    SELECT DISTINCT u.id AS uid
      FROM public.users u
      LEFT JOIN public.drivers       d  ON d.user_id  = u.id
      LEFT JOIN public.trip_managers tm ON tm.user_id = u.id
     WHERE COALESCE(d.aadhaar_number_masked, tm.aadhaar_number_masked) = my_mask
  ) sub;
  IF cnt < threshold THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('matches', matches, 'count', cnt, 'aadhaar_masked', my_mask);
END;
$$;

-- (b) Duplicate UPI: the referred user's UPI appears on N+ withdrawals across users.
CREATE OR REPLACE FUNCTION public.detect_duplicate_upi(_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE AS $$
DECLARE
  threshold INT;
  cnt INT;
  matches JSONB;
BEGIN
  SELECT duplicate_upi_threshold INTO threshold FROM public.fraud_settings WHERE id = 1;
  IF threshold IS NULL THEN RETURN NULL; END IF;

  SELECT COUNT(DISTINCT user_id), jsonb_agg(DISTINCT jsonb_build_object('user_id', user_id, 'upi_id', upi_id))
    INTO cnt, matches
    FROM public.withdrawals
   WHERE upi_id IN (SELECT upi_id FROM public.withdrawals WHERE user_id = _user_id);
  IF cnt < threshold THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('matches', matches, 'count', cnt);
END;
$$;

-- (c) Same agent-driver pair on N+ completed trips in 30 days.
CREATE OR REPLACE FUNCTION public.detect_same_pair_pattern(_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE AS $$
DECLARE
  threshold INT;
  pair_record RECORD;
  matches JSONB := '[]'::jsonb;
BEGIN
  SELECT same_pair_trip_threshold INTO threshold FROM public.fraud_settings WHERE id = 1;
  IF threshold IS NULL THEN RETURN NULL; END IF;

  -- Look at trips where the referred user is either the agent (posted_by) or the
  -- assigned driver, count completed trips per (agent, driver) pair in the last 30d.
  FOR pair_record IN
    SELECT t.posted_by_user_id AS agent_uid, d.user_id AS driver_uid, COUNT(*) AS trips
      FROM public.trips t
      JOIN public.drivers d ON d.id = t.assigned_driver_id
     WHERE t.status = 'completed'
       AND t.updated_at > now() - INTERVAL '30 days'
       AND (t.posted_by_user_id = _user_id OR d.user_id = _user_id)
     GROUP BY t.posted_by_user_id, d.user_id
    HAVING COUNT(*) >= threshold
  LOOP
    matches := matches || jsonb_build_object(
      'agent_user_id', pair_record.agent_uid,
      'driver_user_id', pair_record.driver_uid,
      'trips_30d', pair_record.trips
    );
  END LOOP;

  IF jsonb_array_length(matches) = 0 THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('matches', matches);
END;
$$;

------------------------------------------------------------------------------
-- 4. Apply-action helper: read fraud_action_rules to decide what happens
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_fraud_flag(
  _link_id UUID, _flag_type TEXT, _severity TEXT, _detail JSONB
) RETURNS UUID
LANGUAGE plpgsql AS $$
DECLARE
  rule_action TEXT;
  flag_id UUID;
BEGIN
  -- Look up the action for this (flag_type, severity)
  SELECT action INTO rule_action
    FROM public.fraud_action_rules
   WHERE flag_type = _flag_type AND severity = _severity AND is_active LIMIT 1;
  IF rule_action IS NULL THEN rule_action := 'flag_only'; END IF;

  -- Insert the flag
  INSERT INTO public.referral_fraud_flags (referral_link_id, flag_type, severity, auto_detected, action_taken, detail)
  VALUES (_link_id, _flag_type, _severity, true, rule_action, _detail)
  RETURNING id INTO flag_id;

  -- Apply the action
  IF rule_action = 'suspend_link' THEN
    UPDATE public.referral_links SET status = 'suspended' WHERE id = _link_id AND status NOT IN ('suspended', 'rejected', 'expired');
  ELSIF rule_action = 'hold_earnings' THEN
    UPDATE public.referral_links SET status = 'suspended' WHERE id = _link_id AND status NOT IN ('suspended', 'rejected', 'expired');
  ELSIF rule_action = 'block_withdrawal' THEN
    -- mark the referrer as high-risk so the withdrawal stored proc blocks
    UPDATE public.users SET is_high_risk = true
      WHERE id = (SELECT referrer_user_id FROM public.referral_links WHERE id = _link_id);
  END IF;
  -- 'flag_only' → no side effect

  RETURN flag_id;
END;
$$;

------------------------------------------------------------------------------
-- 5. Auto-detection trigger on referral_links: run on transition into
--    'qualified'/'earning_active' (the moment money starts flowing)
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.run_fraud_detection_on_qualification()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  d JSONB;
BEGIN
  -- Only on first entry into earning state
  IF NEW.status NOT IN ('qualified', 'earning_active') THEN RETURN NEW; END IF;
  IF OLD.status IN ('qualified', 'earning_active', 'cap_reached') THEN RETURN NEW; END IF;

  -- self-referral safety net (also caught by Stage 1's CHECK + trigger)
  IF NEW.referrer_user_id = NEW.referred_user_id THEN
    PERFORM public.apply_fraud_flag(NEW.id, 'self_referral', 'high', jsonb_build_object('caught_at', 'qualification_trigger'));
  END IF;

  d := public.detect_duplicate_aadhaar(NEW.referred_user_id);
  IF d IS NOT NULL THEN
    PERFORM public.apply_fraud_flag(NEW.id, 'duplicate_aadhaar', 'high', d);
  END IF;

  d := public.detect_duplicate_upi(NEW.referred_user_id);
  IF d IS NOT NULL THEN
    PERFORM public.apply_fraud_flag(NEW.id, 'duplicate_upi', 'medium', d);
  END IF;

  d := public.detect_same_pair_pattern(NEW.referred_user_id);
  IF d IS NOT NULL THEN
    PERFORM public.apply_fraud_flag(NEW.id, 'suspicious_trip_pattern', 'medium', d);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS referral_links_run_fraud_detection ON public.referral_links;
CREATE TRIGGER referral_links_run_fraud_detection
  AFTER UPDATE OF status ON public.referral_links
  FOR EACH ROW EXECUTE FUNCTION public.run_fraud_detection_on_qualification();

------------------------------------------------------------------------------
-- 6. reverse_referral_earnings stored proc — admin restore-on-fraud
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reverse_referral_earnings(
  _link_id UUID,
  _admin_actor_user_id UUID,
  _note TEXT DEFAULT 'fraud reversal'
) RETURNS BIGINT
LANGUAGE plpgsql AS $$
DECLARE
  link RECORD;
  to_reverse BIGINT;
BEGIN
  SELECT * INTO link FROM public.referral_links WHERE id = _link_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: referral_link %', _link_id; END IF;

  -- Net of accruals minus existing reversals (positive entries)
  SELECT GREATEST(0, COALESCE(SUM(amount_paise) FILTER (WHERE entry_type = 'accrual'), 0)
                   + COALESCE(SUM(amount_paise) FILTER (WHERE entry_type = 'reversal'), 0))::BIGINT
    INTO to_reverse
    FROM public.referral_ledger WHERE referral_link_id = _link_id;

  IF to_reverse = 0 THEN RETURN 0; END IF;

  INSERT INTO public.referral_ledger (referral_link_id, entry_type, amount_paise, note)
  VALUES (_link_id, 'reversal', -to_reverse,
          format('Admin reversal by %s: %s', _admin_actor_user_id, _note));

  -- Suspend the link
  UPDATE public.referral_links SET status = 'suspended' WHERE id = _link_id AND status <> 'suspended';
  RETURN to_reverse;
END;
$$;

COMMENT ON FUNCTION public.reverse_referral_earnings IS
  'Admin reversal: inserts a NEGATIVE reversal ledger entry equal to the net positive accrued on the link, suspending the link. The reversal flows through referral_balances + referral_withdrawable_summary so the referrer''s withdrawable drops to 0 (or goes negative until further accruals balance it out).';

ANALYZE public.referral_fraud_flags;
