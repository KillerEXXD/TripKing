-- 046_referral_tiers_and_admin_settings.sql
-- Stage 5 of the referral program. Adds the full Configurability Inventory:
--   * referral_tiers (rows) — admin-editable tier slots
--   * referral_settings (single row, id=1) — program flags, qualification gates,
--                                            anti-spam, bonuses, code/link, branding
--   * extends wallet_settings with the rest of §B columns (top-up limits, withdrawal
--     limits, source priority, source eligibility, etc.)
--   * fraud_settings (single row, id=1) — auto-flag thresholds, hold/grace periods
--   * fraud_action_rules (rows) — per-(flag_type × severity) action mapping
--   * notification_templates (rows) — per-type-per-locale title + body + channels
--   * Refactor the Stage-4 accrual trigger to read these tables (instead of the
--     hardcoded ₹2,500/₹50 + cash_wallet/direct_upi list)
--
-- Spec: docs/REFERRAL_PROGRAM_REQUIREMENTS.md §18 (admin config) + Configurability
--       Inventory in docs/REFERRAL_IMPLEMENTATION_PLAN.md.
-- Plan: Stage 5.

------------------------------------------------------------------------------
-- 1. Extend wallet_settings with the rest of Configurability §B
--    (043 already created the table + the 4 fee/promo knobs).
------------------------------------------------------------------------------

ALTER TABLE public.wallet_settings
  -- Top-ups
  ADD COLUMN IF NOT EXISTS min_topup_paise                 BIGINT NOT NULL DEFAULT 5000      CHECK (min_topup_paise >= 0),
  ADD COLUMN IF NOT EXISTS max_topup_per_txn_paise         BIGINT NOT NULL DEFAULT 5000000   CHECK (max_topup_per_txn_paise >= 0),
  ADD COLUMN IF NOT EXISTS max_topup_per_user_per_day_paise BIGINT NOT NULL DEFAULT 10000000 CHECK (max_topup_per_user_per_day_paise >= 0),
  ADD COLUMN IF NOT EXISTS topup_presets_paise             JSONB  NOT NULL DEFAULT '[10000,25000,50000,100000]'::jsonb,
  ADD COLUMN IF NOT EXISTS transfer_presets_paise          JSONB  NOT NULL DEFAULT '[10000,25000,50000,100000]'::jsonb,
  -- Withdrawals
  ADD COLUMN IF NOT EXISTS min_withdrawal_paise            BIGINT NOT NULL DEFAULT 50000     CHECK (min_withdrawal_paise >= 0),
  ADD COLUMN IF NOT EXISTS driver_monthly_withdrawal_cap_paise BIGINT NOT NULL DEFAULT 500000  CHECK (driver_monthly_withdrawal_cap_paise >= 0),
  ADD COLUMN IF NOT EXISTS agent_monthly_withdrawal_cap_paise  BIGINT NOT NULL DEFAULT 1000000 CHECK (agent_monthly_withdrawal_cap_paise >= 0),
  ADD COLUMN IF NOT EXISTS daily_withdrawal_cap_paise      BIGINT NOT NULL DEFAULT 200000    CHECK (daily_withdrawal_cap_paise >= 0),
  ADD COLUMN IF NOT EXISTS withdrawal_hold_days            INT    NOT NULL DEFAULT 3         CHECK (withdrawal_hold_days >= 0),
  ADD COLUMN IF NOT EXISTS withdrawal_requires_admin_approval BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS new_user_withdrawal_delay_days  INT    NOT NULL DEFAULT 7         CHECK (new_user_withdrawal_delay_days >= 0),
  ADD COLUMN IF NOT EXISTS payout_provider                 TEXT   NOT NULL DEFAULT 'razorpay' CHECK (payout_provider IN ('razorpay','cashfree','manual')),
  ADD COLUMN IF NOT EXISTS payout_method                   TEXT   NOT NULL DEFAULT 'UPI'     CHECK (payout_method IN ('UPI','IMPS','NEFT')),
  -- Source eligibility (the anti-circular knob)
  ADD COLUMN IF NOT EXISTS eligible_payment_sources_for_referral JSONB NOT NULL DEFAULT '["cash_wallet","direct_upi"]'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_source_priority         JSONB  NOT NULL DEFAULT '["promo","transferred","cash"]'::jsonb,
  -- Misc
  ADD COLUMN IF NOT EXISTS default_platform_fee_pct        NUMERIC(5,2) NOT NULL DEFAULT 10.0 CHECK (default_platform_fee_pct >= 0 AND default_platform_fee_pct <= 100);

------------------------------------------------------------------------------
-- 2. referral_tiers (rows)
------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.referral_tiers (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_name                   TEXT NOT NULL,
  min_qualified_referrals     INT  NOT NULL CHECK (min_qualified_referrals >= 0),
  max_qualified_referrals     INT             CHECK (max_qualified_referrals IS NULL OR max_qualified_referrals >= min_qualified_referrals),
  cap_paise                   BIGINT NOT NULL CHECK (cap_paise >= 0),
  payout_per_trip_paise       BIGINT NOT NULL CHECK (payout_per_trip_paise >= 0),
  applies_to_role             TEXT NOT NULL DEFAULT 'both' CHECK (applies_to_role IN ('driver','trip_manager','both')),
  applies_to_pair             JSONB,                       -- NULL = all pairs; e.g. ["d2d","d2a"]
  applies_retroactively       BOOLEAN NOT NULL DEFAULT false,
  active_from                 TIMESTAMPTZ,
  active_to                   TIMESTAMPTZ,
  is_active                   BOOLEAN NOT NULL DEFAULT true,
  sort_order                  INT NOT NULL DEFAULT 0,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS referral_tiers_active_idx ON public.referral_tiers (is_active, sort_order);

CREATE OR REPLACE FUNCTION public.touch_referral_tiers_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS referral_tiers_touch ON public.referral_tiers;
CREATE TRIGGER referral_tiers_touch BEFORE UPDATE ON public.referral_tiers
  FOR EACH ROW EXECUTE FUNCTION public.touch_referral_tiers_updated_at();

-- Seed Tiers 1–4 (idempotent on slot_name)
INSERT INTO public.referral_tiers (slot_name, min_qualified_referrals, max_qualified_referrals, cap_paise, payout_per_trip_paise, sort_order)
VALUES
  ('Tier 1', 1,   10,   250000, 5000, 10),
  ('Tier 2', 11,  25,   350000, 5000, 20),
  ('Tier 3', 26,  50,   500000, 5000, 30),
  ('Tier 4', 51,  NULL, 750000, 5000, 40)
ON CONFLICT DO NOTHING;

------------------------------------------------------------------------------
-- 3. referral_settings (single row)
------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.referral_settings (
  id                                          INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Program
  program_active                              BOOLEAN NOT NULL DEFAULT true,
  program_name                                TEXT    NOT NULL DEFAULT 'TripKing Referral Rewards',
  program_starts_at                           TIMESTAMPTZ,
  program_ends_at                             TIMESTAMPTZ,
  pair_driver_to_driver                       BOOLEAN NOT NULL DEFAULT true,
  pair_driver_to_agent                        BOOLEAN NOT NULL DEFAULT true,
  pair_agent_to_driver                        BOOLEAN NOT NULL DEFAULT true,
  pair_agent_to_agent                         BOOLEAN NOT NULL DEFAULT true,
  -- Qualification gates
  min_eligible_paid_trips_for_qualification   INT     NOT NULL DEFAULT 5  CHECK (min_eligible_paid_trips_for_qualification >= 0),
  min_trip_fare_paise_for_accrual             BIGINT  NOT NULL DEFAULT 50000 CHECK (min_trip_fare_paise_for_accrual >= 0),
  min_trip_distance_km_for_accrual            INT     NOT NULL DEFAULT 10 CHECK (min_trip_distance_km_for_accrual >= 0),
  dispute_free_days                           INT     NOT NULL DEFAULT 3  CHECK (dispute_free_days >= 0),
  requires_admin_approval                     BOOLEAN NOT NULL DEFAULT false,
  requires_promo_exhausted                    BOOLEAN NOT NULL DEFAULT false,  -- placeholder for future promo system
  referral_qualification_expiry_days          INT     NOT NULL DEFAULT 90 CHECK (referral_qualification_expiry_days >= 0),
  -- Anti-spam
  max_active_referrals_per_user               INT,
  max_new_referrals_per_user_per_month        INT,
  -- Bonuses
  welcome_bonus_paise                         BIGINT  NOT NULL DEFAULT 0 CHECK (welcome_bonus_paise >= 0),
  referrer_signup_bonus_paise                 BIGINT  NOT NULL DEFAULT 0 CHECK (referrer_signup_bonus_paise >= 0),
  -- Code & link
  code_length                                 INT     NOT NULL DEFAULT 8 CHECK (code_length BETWEEN 4 AND 32),
  code_charset                                TEXT    NOT NULL DEFAULT 'crockford_base32',
  referral_link_base                          TEXT    NOT NULL DEFAULT 'tripkingapp.com/r/',
  allow_custom_code                           BOOLEAN NOT NULL DEFAULT false,
  custom_code_min_length                      INT     NOT NULL DEFAULT 5 CHECK (custom_code_min_length BETWEEN 3 AND 32),
  -- Notifications & branding
  whatsapp_share_template                     TEXT    NOT NULL DEFAULT 'Join TripKing with my code {code}: {link}',
  admin_high_payout_threshold_paise           BIGINT  NOT NULL DEFAULT 1000000 CHECK (admin_high_payout_threshold_paise >= 0),
  currency                                    TEXT    NOT NULL DEFAULT 'INR',
  currency_symbol                             TEXT    NOT NULL DEFAULT '₹',
  terms_markdown                              TEXT    NOT NULL DEFAULT '',
  faq_markdown                                TEXT    NOT NULL DEFAULT '',
  updated_at                                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.referral_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.touch_referral_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS referral_settings_touch ON public.referral_settings;
CREATE TRIGGER referral_settings_touch BEFORE UPDATE ON public.referral_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_referral_settings_updated_at();

------------------------------------------------------------------------------
-- 4. fraud_settings (single row)
------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.fraud_settings (
  id                                INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  duplicate_aadhaar_threshold       INT     NOT NULL DEFAULT 2 CHECK (duplicate_aadhaar_threshold >= 1),
  duplicate_upi_threshold           INT     NOT NULL DEFAULT 2 CHECK (duplicate_upi_threshold >= 1),
  same_pair_trip_threshold          INT     NOT NULL DEFAULT 20 CHECK (same_pair_trip_threshold >= 1),
  signup_velocity_threshold         INT     NOT NULL DEFAULT 5 CHECK (signup_velocity_threshold >= 1),
  high_risk_extra_hold_days         INT     NOT NULL DEFAULT 14 CHECK (high_risk_extra_hold_days >= 0),
  reversal_grace_hours              INT     NOT NULL DEFAULT 24 CHECK (reversal_grace_hours >= 0),
  auto_resolve_low_severity_days    INT     NOT NULL DEFAULT 30 CHECK (auto_resolve_low_severity_days >= 0),
  updated_at                        TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.fraud_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.touch_fraud_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS fraud_settings_touch ON public.fraud_settings;
CREATE TRIGGER fraud_settings_touch BEFORE UPDATE ON public.fraud_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_fraud_settings_updated_at();

------------------------------------------------------------------------------
-- 5. fraud_action_rules (rows)
------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.fraud_action_rules (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_type                TEXT NOT NULL CHECK (flag_type IN (
                             'duplicate_aadhaar', 'duplicate_upi', 'duplicate_device',
                             'self_referral', 'suspicious_trip_pattern', 'high_risk_user', 'manual_review'
                           )),
  severity                 TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  action                   TEXT NOT NULL CHECK (action IN ('flag_only', 'hold_earnings', 'suspend_link', 'block_withdrawal')),
  auto_resolve_after_days  INT          CHECK (auto_resolve_after_days IS NULL OR auto_resolve_after_days > 0),
  is_active                BOOLEAN NOT NULL DEFAULT true,
  sort_order               INT NOT NULL DEFAULT 0,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (flag_type, severity)
);

CREATE OR REPLACE FUNCTION public.touch_fraud_action_rules_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS fraud_action_rules_touch ON public.fraud_action_rules;
CREATE TRIGGER fraud_action_rules_touch BEFORE UPDATE ON public.fraud_action_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_fraud_action_rules_updated_at();

-- Seed defaults: every (flag_type × severity) combo
INSERT INTO public.fraud_action_rules (flag_type, severity, action, sort_order)
VALUES
  ('duplicate_aadhaar',       'high',   'suspend_link',    10),
  ('duplicate_aadhaar',       'medium', 'hold_earnings',   11),
  ('duplicate_aadhaar',       'low',    'flag_only',       12),
  ('duplicate_upi',           'high',   'block_withdrawal',20),
  ('duplicate_upi',           'medium', 'hold_earnings',   21),
  ('duplicate_upi',           'low',    'flag_only',       22),
  ('duplicate_device',        'high',   'suspend_link',    30),
  ('duplicate_device',        'medium', 'hold_earnings',   31),
  ('duplicate_device',        'low',    'flag_only',       32),
  ('self_referral',           'high',   'suspend_link',    40),
  ('self_referral',           'medium', 'suspend_link',    41),
  ('self_referral',           'low',    'flag_only',       42),
  ('suspicious_trip_pattern', 'high',   'hold_earnings',   50),
  ('suspicious_trip_pattern', 'medium', 'flag_only',       51),
  ('suspicious_trip_pattern', 'low',    'flag_only',       52),
  ('high_risk_user',          'high',   'block_withdrawal',60),
  ('high_risk_user',          'medium', 'hold_earnings',   61),
  ('high_risk_user',          'low',    'flag_only',       62),
  ('manual_review',           'high',   'suspend_link',    70),
  ('manual_review',           'medium', 'hold_earnings',   71),
  ('manual_review',           'low',    'flag_only',       72)
ON CONFLICT (flag_type, severity) DO NOTHING;

------------------------------------------------------------------------------
-- 6. notification_templates (rows)
------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type        TEXT NOT NULL,
  locale      TEXT NOT NULL DEFAULT 'en',
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  channels    JSONB NOT NULL DEFAULT '["in_app"]'::jsonb,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  sort_order  INT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (type, locale)
);

CREATE OR REPLACE FUNCTION public.touch_notification_templates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS notification_templates_touch ON public.notification_templates;
CREATE TRIGGER notification_templates_touch BEFORE UPDATE ON public.notification_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_notification_templates_updated_at();

-- Seed English templates for the referral + withdrawal notification types
INSERT INTO public.notification_templates (type, locale, title, body, sort_order) VALUES
  ('referral_signup',            'en', 'New referral!',                  '{name} just signed up with your code.', 10),
  ('referral_verified',          'en', '{name} is verified',             'Once they finish promo credits and complete a paid trip, you start earning.', 20),
  ('referral_first_eligible_trip','en','First eligible trip done',       '{name} just completed their first paid trip — you earned ₹{amount}.', 30),
  ('referral_qualified',         'en', '{name} is now qualified',        'They count toward your tier progress.', 40),
  ('referral_earning',           'en', '+₹{amount} from {name}',         'Trip {tripId} completed. Lifetime earned: ₹{lifetime}.', 50),
  ('referral_released',          'en', '₹{amount} ready to withdraw',    'Your referral earnings have cleared the {holdDays}-day hold.', 60),
  ('referral_cap_reached',       'en', 'Cap reached for {name}',         'You earned the full ₹{cap} from this referral.', 70),
  ('withdrawal_requested',       'en', 'Withdrawal requested',           '₹{amount} requested to {upi}. Pending review.', 80),
  ('withdrawal_approved',        'en', 'Withdrawal approved',            '₹{amount} is being processed to {upi}.', 90),
  ('withdrawal_paid',            'en', 'Withdrawal paid',                '₹{amount} sent to {upi}. Ref: {ref}.', 100),
  ('withdrawal_rejected',        'en', 'Withdrawal rejected',            'Reason: {reason}. Funds returned to your withdrawable balance.', 110)
ON CONFLICT (type, locale) DO NOTHING;

------------------------------------------------------------------------------
-- 7. RLS — anyone reads settings (UI shows defaults to logged-in users);
--    admin writes everything; per-row tables are admin-only writes.
------------------------------------------------------------------------------

ALTER TABLE public.referral_tiers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_settings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_settings          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_action_rules      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_templates  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referral_tiers_read_all  ON public.referral_tiers;
CREATE POLICY referral_tiers_read_all  ON public.referral_tiers  FOR SELECT USING (true);
DROP POLICY IF EXISTS referral_tiers_admin_write ON public.referral_tiers;
CREATE POLICY referral_tiers_admin_write ON public.referral_tiers FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS referral_settings_read_all  ON public.referral_settings;
CREATE POLICY referral_settings_read_all  ON public.referral_settings  FOR SELECT USING (true);
DROP POLICY IF EXISTS referral_settings_admin_write ON public.referral_settings;
CREATE POLICY referral_settings_admin_write ON public.referral_settings FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS fraud_settings_read_admin ON public.fraud_settings;
CREATE POLICY fraud_settings_read_admin ON public.fraud_settings FOR SELECT USING (public.is_admin());
DROP POLICY IF EXISTS fraud_settings_admin_write ON public.fraud_settings;
CREATE POLICY fraud_settings_admin_write ON public.fraud_settings FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS fraud_action_rules_admin_only ON public.fraud_action_rules;
CREATE POLICY fraud_action_rules_admin_only ON public.fraud_action_rules FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS notification_templates_read_all ON public.notification_templates;
CREATE POLICY notification_templates_read_all ON public.notification_templates FOR SELECT USING (true);
DROP POLICY IF EXISTS notification_templates_admin_write ON public.notification_templates;
CREATE POLICY notification_templates_admin_write ON public.notification_templates FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

------------------------------------------------------------------------------
-- 8. Refactor accrual trigger: read from referral_tiers + wallet_settings
------------------------------------------------------------------------------

-- Replace the Stage-4 hardcoded eligible-source helper with one that reads JSONB.
CREATE OR REPLACE FUNCTION public.fee_source_is_referral_eligible(_source TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.wallet_settings
     WHERE id = 1
       AND (eligible_payment_sources_for_referral ? _source)
  );
$$;

-- Tier resolver: pick the active tier whose [min, max] brackets the count and that
-- applies to the role/pair. Returns the tier's cap_paise + payout_per_trip_paise.
-- Falls back to the lowest active tier if none matches (defensive).
CREATE OR REPLACE FUNCTION public.resolve_referral_tier(_referrer_qualified_count INT, _referred_role TEXT)
RETURNS TABLE (cap_paise BIGINT, payout_per_trip_paise BIGINT)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  picked RECORD;
BEGIN
  SELECT t.cap_paise, t.payout_per_trip_paise INTO picked
    FROM public.referral_tiers t
   WHERE t.is_active
     AND (t.applies_to_role = 'both' OR t.applies_to_role = _referred_role)
     AND _referrer_qualified_count >= t.min_qualified_referrals
     AND (t.max_qualified_referrals IS NULL OR _referrer_qualified_count <= t.max_qualified_referrals)
     AND (t.active_from IS NULL OR t.active_from <= now())
     AND (t.active_to   IS NULL OR t.active_to   >= now())
   ORDER BY t.sort_order ASC, t.min_qualified_referrals ASC
   LIMIT 1;
  IF picked.cap_paise IS NULL THEN
    -- Fallback: lowest active tier
    SELECT t.cap_paise, t.payout_per_trip_paise INTO picked
      FROM public.referral_tiers t
     WHERE t.is_active
       AND (t.applies_to_role = 'both' OR t.applies_to_role = _referred_role)
     ORDER BY t.sort_order ASC LIMIT 1;
  END IF;
  cap_paise := picked.cap_paise;
  payout_per_trip_paise := picked.payout_per_trip_paise;
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.accrue_referral_on_fee_charged()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  link RECORD;
  tier RECORD;
  s RECORD;
  qualified_count INT;
  payout BIGINT;
  link_payout BIGINT;
  link_cap BIGINT;
  remaining_cap BIGINT;
  new_status TEXT;
  new_qualified_at TIMESTAMPTZ;
  new_cap_reached_at TIMESTAMPTZ;
BEGIN
  IF NEW.status <> 'charged' THEN RETURN NEW; END IF;

  -- 1. Source must be referral-eligible (now reads wallet_settings JSONB)
  IF NOT public.fee_source_is_referral_eligible(NEW.payment_source) THEN
    RETURN NEW;
  END IF;

  -- 2. Read program-wide flags
  SELECT program_active, requires_admin_approval INTO s FROM public.referral_settings WHERE id = 1;
  IF NOT s.program_active THEN RETURN NEW; END IF;

  -- 3. The payer must have a referrer
  SELECT * INTO link FROM public.referral_links WHERE referred_user_id = NEW.payer_user_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- 4. Link must not be in a terminal/blocked state
  IF link.status IN ('cap_reached', 'suspended', 'rejected', 'expired', 'verification_rejected') THEN
    RETURN NEW;
  END IF;

  -- 5. Referred user must be KYC-approved
  IF NOT public.user_is_kyc_approved(NEW.payer_user_id) THEN
    RETURN NEW;
  END IF;

  -- 6. Resolve tier (only when this link doesn't already have a snapshot — i.e., first
  --    accrual). cap_paise + payout_per_trip_paise on the link were defaulted to ₹2,500 + ₹50
  --    by Stage 4; if qualified_at is NULL we re-snapshot from the current tier matrix.
  IF link.qualified_at IS NULL THEN
    SELECT COUNT(*)::INT INTO qualified_count
      FROM public.referral_links
     WHERE referrer_user_id = link.referrer_user_id
       AND status IN ('qualified', 'earning_active', 'cap_reached');
    SELECT * INTO tier FROM public.resolve_referral_tier(qualified_count + 1, link.referred_user_role);
    link_cap    := COALESCE(tier.cap_paise, link.cap_paise);
    link_payout := COALESCE(tier.payout_per_trip_paise, link.payout_per_trip_paise);
  ELSE
    link_cap    := link.cap_paise;
    link_payout := link.payout_per_trip_paise;
  END IF;

  -- 7. Cap check
  remaining_cap := link_cap - link.total_earned_paise;
  IF remaining_cap <= 0 THEN
    UPDATE public.referral_links SET status = 'cap_reached', cap_reached_at = COALESCE(cap_reached_at, now())
      WHERE id = link.id AND status <> 'cap_reached';
    RETURN NEW;
  END IF;
  payout := LEAST(link_payout, remaining_cap);

  -- 8. Idempotency net
  PERFORM 1 FROM public.referral_ledger
    WHERE referral_link_id = link.id AND trip_id = NEW.trip_id AND entry_type = 'accrual';
  IF FOUND THEN RETURN NEW; END IF;

  -- 9. Insert the accrual
  INSERT INTO public.referral_ledger (referral_link_id, entry_type, amount_paise, trip_id, platform_fee_charge_id, note)
    VALUES (link.id, 'accrual', payout, NEW.trip_id, NEW.id,
            format('Per-trip accrual · trip %s · side %s', NEW.trip_id, NEW.side));

  -- 10. Bump link counters + status (snapshot tier values on first qualification)
  new_status := link.status;
  new_qualified_at := link.qualified_at;
  new_cap_reached_at := link.cap_reached_at;
  IF link.eligible_paid_trips_count = 0 THEN
    new_status := 'paid_trips_started';
  END IF;
  IF link.qualified_at IS NULL THEN
    new_status := 'earning_active';
    new_qualified_at := now();
  END IF;
  IF (link.total_earned_paise + payout) >= link_cap THEN
    new_status := 'cap_reached';
    new_cap_reached_at := now();
  END IF;

  UPDATE public.referral_links
     SET total_earned_paise = total_earned_paise + payout,
         eligible_paid_trips_count = eligible_paid_trips_count + 1,
         status = new_status,
         qualified_at = new_qualified_at,
         cap_reached_at = new_cap_reached_at,
         cap_paise = link_cap,
         payout_per_trip_paise = link_payout
   WHERE id = link.id;

  RETURN NEW;
END;
$$;

------------------------------------------------------------------------------
-- 9. Comments
------------------------------------------------------------------------------

COMMENT ON TABLE public.referral_tiers IS
  'Admin-editable tier slots. Resolved at qualification time by resolve_referral_tier(qualified_count, referred_role); the tier''s cap_paise + payout_per_trip_paise are then snapshotted onto the referral_links row.';
COMMENT ON TABLE public.referral_settings IS
  'Single-row admin program settings: pair flags, qualification gates, anti-spam, bonuses, code/link, branding, share template, admin alert thresholds.';
COMMENT ON TABLE public.fraud_settings IS
  'Single-row admin fraud thresholds (auto-flag triggers, hold extensions, reversal grace, auto-resolve).';
COMMENT ON TABLE public.fraud_action_rules IS
  'Per-(flag_type × severity) action mapping. Stage 9 reads this to decide what action a triggered flag enacts.';
COMMENT ON TABLE public.notification_templates IS
  'Per-type-per-locale notification copy (title/body with {var} substitution) + channels (in_app/push/sms/whatsapp/email).';

ANALYZE public.referral_tiers;
ANALYZE public.referral_settings;
ANALYZE public.fraud_settings;
ANALYZE public.fraud_action_rules;
ANALYZE public.notification_templates;
