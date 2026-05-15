-- 045_referral_ledger_and_accrual.sql
-- Stage 4 of the referral program. Adds:
--   * referral_links — one row per referrer ↔ referred pair (12 statuses); backfilled
--                      from users.referred_by_user_id
--   * referral_ledger — append-only earnings/withdrawal/transfer/reversal entries
--   * referral_balances — per-user view: pending, released, transferred, withdrawn,
--                         withdrawable, lifetime
--   * AFTER INSERT trigger on platform_fee_charges (status='charged'): if the payer's
--     side has a referrer + the source is referral-eligible (cash_wallet | direct_upi),
--     credit the referrer's ledger with the configured per-trip payout from the
--     applicable tier. Cap-aware: never exceeds cap_paise.
--
-- Stage 4 hardcodes the eligible-source list to {cash_wallet, direct_upi} and the
-- single tier (₹2,500 cap, ₹50/trip). Stage 5 will move these to admin tables and
-- the trigger will read them dynamically.
--
-- Spec: docs/REFERRAL_PROGRAM_REQUIREMENTS.md §6 (qualification), §10 (per-side
--       eligibility), §12 (calculation), §13 (eligible trip), §15 (statuses).
-- Plan: docs/REFERRAL_IMPLEMENTATION_PLAN.md Stage 4.

------------------------------------------------------------------------------
-- 1. referral_links
------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.referral_links (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_user_id            UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referred_user_id            UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  -- The role recorded at the time of pairing. A user may later add a second profile
  -- (driver who also becomes an agent) — we still tag this link by their *primary*
  -- role at signup. Source-of-truth for per-side resolution lives on platform_fee_charges.
  referred_user_role          TEXT NOT NULL CHECK (referred_user_role IN ('driver', 'trip_manager')),
  status                      TEXT NOT NULL DEFAULT 'signed_up'
                                CHECK (status IN (
                                  'signed_up',
                                  'verification_pending',
                                  'verified',
                                  'verification_rejected',
                                  'paid_trips_started',
                                  'qualified',
                                  'earning_active',
                                  'cap_reached',
                                  'suspended',
                                  'rejected',
                                  'expired'
                                )),
  -- Tier snapshot at qualification (Stage 5 moves to a real tier_slot_id FK).
  cap_paise                   BIGINT NOT NULL DEFAULT 250000   CHECK (cap_paise >= 0),  -- ₹2,500
  payout_per_trip_paise       BIGINT NOT NULL DEFAULT 5000     CHECK (payout_per_trip_paise >= 0),  -- ₹50
  qualified_at                TIMESTAMPTZ,
  cap_reached_at              TIMESTAMPTZ,
  eligible_paid_trips_count   INT NOT NULL DEFAULT 0 CHECK (eligible_paid_trips_count >= 0),
  total_earned_paise          BIGINT NOT NULL DEFAULT 0 CHECK (total_earned_paise >= 0),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (referrer_user_id <> referred_user_id)
);

CREATE INDEX IF NOT EXISTS referral_links_referrer_idx     ON public.referral_links (referrer_user_id, status);
CREATE INDEX IF NOT EXISTS referral_links_referred_idx     ON public.referral_links (referred_user_id);
CREATE INDEX IF NOT EXISTS referral_links_status_idx       ON public.referral_links (status, qualified_at);

CREATE OR REPLACE FUNCTION public.touch_referral_links_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS referral_links_touch ON public.referral_links;
CREATE TRIGGER referral_links_touch BEFORE UPDATE ON public.referral_links
  FOR EACH ROW EXECUTE FUNCTION public.touch_referral_links_updated_at();

------------------------------------------------------------------------------
-- 2. referral_ledger
------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.referral_ledger (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_link_id         UUID NOT NULL REFERENCES public.referral_links(id) ON DELETE CASCADE,
  entry_type               TEXT NOT NULL CHECK (entry_type IN (
                             'accrual',
                             'withdrawal',
                             'transfer_to_cash_wallet',
                             'reversal',
                             'adjustment'
                           )),
  amount_paise             BIGINT NOT NULL,  -- signed: + on credit, − on debit
  trip_id                  UUID REFERENCES public.trips(id) ON DELETE SET NULL,
  platform_fee_charge_id   UUID REFERENCES public.platform_fee_charges(id) ON DELETE SET NULL,
  withdrawal_id            UUID,  -- FK added in Stage 7 (withdrawals table)
  cash_wallet_ledger_id    UUID REFERENCES public.cash_wallet_ledger(id) ON DELETE SET NULL,
  note                     TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Idempotency: at most one accrual per (link, trip) — re-running the trigger
  -- never double-credits.
  UNIQUE NULLS NOT DISTINCT (referral_link_id, trip_id, entry_type)
);

CREATE INDEX IF NOT EXISTS referral_ledger_link_idx   ON public.referral_ledger (referral_link_id, created_at DESC);
CREATE INDEX IF NOT EXISTS referral_ledger_trip_idx   ON public.referral_ledger (trip_id);
CREATE INDEX IF NOT EXISTS referral_ledger_charge_idx ON public.referral_ledger (platform_fee_charge_id);

------------------------------------------------------------------------------
-- 3. referral_balances view (per referrer)
------------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.referral_balances AS
SELECT
  rl.referrer_user_id AS user_id,
  COALESCE(SUM(led.amount_paise) FILTER (WHERE led.entry_type = 'accrual'), 0)::BIGINT                AS lifetime_earned_paise,
  -- pending = accruals in their hold window (Stage 7 makes this configurable; until
  -- then released = lifetime accrual minus reversals minus withdrawals/transfers).
  -- For Stage 4 the "withdrawable" number is just net positive; Stage 7 tightens this.
  COALESCE(SUM(led.amount_paise) FILTER (WHERE led.entry_type IN ('reversal')), 0)::BIGINT            AS reversed_paise,
  COALESCE(SUM(led.amount_paise) FILTER (WHERE led.entry_type = 'withdrawal'), 0)::BIGINT             AS withdrawn_paise,
  COALESCE(SUM(led.amount_paise) FILTER (WHERE led.entry_type = 'transfer_to_cash_wallet'), 0)::BIGINT AS transferred_paise,
  COALESCE(SUM(led.amount_paise), 0)::BIGINT                                                          AS net_paise,
  COUNT(DISTINCT rl.id) FILTER (WHERE rl.status IN ('qualified', 'earning_active'))                   AS earning_active_count,
  COUNT(DISTINCT rl.id) FILTER (WHERE rl.status = 'cap_reached')                                      AS cap_reached_count,
  COUNT(DISTINCT rl.id)                                                                               AS total_referred_count
FROM public.referral_links rl
LEFT JOIN public.referral_ledger led ON led.referral_link_id = rl.id
GROUP BY rl.referrer_user_id;

------------------------------------------------------------------------------
-- 4. Backfill: one referral_links row per existing users.referred_by_user_id
--    Status seeded from the referred user's KYC: approved → 'verified',
--    docs_submitted/video_pending → 'verification_pending',
--    rejected → 'verification_rejected', else 'signed_up'.
------------------------------------------------------------------------------

INSERT INTO public.referral_links (referrer_user_id, referred_user_id, referred_user_role, status)
SELECT
  u.referred_by_user_id,
  u.id,
  COALESCE(u.role, 'driver'),
  CASE
    WHEN u.id IN (SELECT user_id FROM public.drivers       WHERE kyc_status = 'approved')
      OR u.id IN (SELECT user_id FROM public.trip_managers WHERE kyc_status = 'approved')
      THEN 'verified'
    WHEN u.id IN (SELECT user_id FROM public.drivers       WHERE kyc_status IN ('docs_submitted','video_pending','ready_for_approval'))
      OR u.id IN (SELECT user_id FROM public.trip_managers WHERE kyc_status IN ('docs_submitted','video_pending','ready_for_approval'))
      THEN 'verification_pending'
    WHEN u.id IN (SELECT user_id FROM public.drivers       WHERE kyc_status = 'rejected')
      OR u.id IN (SELECT user_id FROM public.trip_managers WHERE kyc_status = 'rejected')
      THEN 'verification_rejected'
    ELSE 'signed_up'
  END
FROM public.users u
WHERE u.referred_by_user_id IS NOT NULL
ON CONFLICT (referred_user_id) DO NOTHING;

------------------------------------------------------------------------------
-- 5. Helper: KYC-approved check for a user (driver OR agent profile)
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_is_kyc_approved(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.drivers       WHERE user_id = _user_id AND kyc_status = 'approved'
    UNION ALL
    SELECT 1 FROM public.trip_managers WHERE user_id = _user_id AND kyc_status = 'approved'
  );
$$;

------------------------------------------------------------------------------
-- 6. The accrual trigger
------------------------------------------------------------------------------

-- Stage 4: hardcoded eligible source list. Stage 5 replaces with a read from
-- wallet_settings.eligible_payment_sources_for_referral (JSONB).
CREATE OR REPLACE FUNCTION public.fee_source_is_referral_eligible(_source TEXT)
RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
AS $$
  SELECT _source IN ('cash_wallet', 'direct_upi');
$$;

-- The Stage-4 single-tier accrual logic. Reads payout_per_trip_paise and cap_paise
-- straight off referral_links (defaults seeded at creation; Stage 5 will snapshot
-- from referral_tiers at qualification time).
CREATE OR REPLACE FUNCTION public.accrue_referral_on_fee_charged()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  link RECORD;
  payout BIGINT;
  remaining_cap BIGINT;
  new_status TEXT;
  new_qualified_at TIMESTAMPTZ;
  new_cap_reached_at TIMESTAMPTZ;
  ledger_id UUID;
BEGIN
  -- We only act on charged rows
  IF NEW.status <> 'charged' THEN RETURN NEW; END IF;

  -- 1. Source must be referral-eligible (Stage-4 hardcoded; Stage-5 reads admin list)
  IF NOT public.fee_source_is_referral_eligible(NEW.payment_source) THEN
    RETURN NEW;
  END IF;

  -- 2. The payer (this side's user) must have a referrer
  SELECT * INTO link FROM public.referral_links WHERE referred_user_id = NEW.payer_user_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- 3. Link must not already be in a terminal/blocked state
  IF link.status IN ('cap_reached', 'suspended', 'rejected', 'expired', 'verification_rejected') THEN
    RETURN NEW;
  END IF;

  -- 4. Referred user must be KYC-approved (placeholder for promo-exhaustion gate)
  IF NOT public.user_is_kyc_approved(NEW.payer_user_id) THEN
    -- Bump the link status to 'paid_trips_started' anyway (so the dashboard reflects activity)
    -- but DON'T credit. Stage 5 might gate this differently.
    RETURN NEW;
  END IF;

  -- 5. Cap check (payout = min(per-trip-payout, remaining cap))
  remaining_cap := link.cap_paise - link.total_earned_paise;
  IF remaining_cap <= 0 THEN
    -- Defensive: cap_reached should have been set already, but in case of drift
    UPDATE public.referral_links SET status = 'cap_reached', cap_reached_at = COALESCE(cap_reached_at, now())
      WHERE id = link.id AND status <> 'cap_reached';
    RETURN NEW;
  END IF;
  payout := LEAST(link.payout_per_trip_paise, remaining_cap);

  -- 6. Idempotency net: UNIQUE(link, trip, entry_type) catches re-runs; we still
  -- guard here to skip silently rather than rely on the unique violation.
  PERFORM 1 FROM public.referral_ledger
    WHERE referral_link_id = link.id AND trip_id = NEW.trip_id AND entry_type = 'accrual';
  IF FOUND THEN RETURN NEW; END IF;

  -- 7. Insert the accrual ledger row
  INSERT INTO public.referral_ledger (referral_link_id, entry_type, amount_paise, trip_id, platform_fee_charge_id, note)
    VALUES (link.id, 'accrual', payout, NEW.trip_id, NEW.id,
            format('Per-trip accrual · trip %s · side %s', NEW.trip_id, NEW.side))
    RETURNING id INTO ledger_id;

  -- 8. Bump the link counters + status
  new_status := link.status;
  new_qualified_at := link.qualified_at;
  new_cap_reached_at := link.cap_reached_at;

  -- This is the link's first eligible trip → 'paid_trips_started'
  IF link.eligible_paid_trips_count = 0 THEN
    new_status := 'paid_trips_started';
  END IF;

  -- Stage-4 simplification: a referral becomes 'qualified' on its first eligible
  -- accrual (since we already credited above). Stage 5 introduces the configurable
  -- "min N eligible trips" gate from referral_settings.min_eligible_paid_trips_for_qualification.
  IF link.qualified_at IS NULL THEN
    new_status := 'earning_active';
    new_qualified_at := now();
  END IF;

  -- Cap reached after this accrual?
  IF (link.total_earned_paise + payout) >= link.cap_paise THEN
    new_status := 'cap_reached';
    new_cap_reached_at := now();
  END IF;

  UPDATE public.referral_links
     SET total_earned_paise = total_earned_paise + payout,
         eligible_paid_trips_count = eligible_paid_trips_count + 1,
         status = new_status,
         qualified_at = new_qualified_at,
         cap_reached_at = new_cap_reached_at
   WHERE id = link.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_fee_charges_accrue_referral ON public.platform_fee_charges;
CREATE TRIGGER platform_fee_charges_accrue_referral
  AFTER INSERT ON public.platform_fee_charges
  FOR EACH ROW
  EXECUTE FUNCTION public.accrue_referral_on_fee_charged();

-- Also fire on UPDATE in case the Stage-3 trigger inserts the row in 'pending' first
-- and updates it to 'charged' a moment later (it currently does, in two steps).
DROP TRIGGER IF EXISTS platform_fee_charges_accrue_referral_on_charge ON public.platform_fee_charges;
CREATE TRIGGER platform_fee_charges_accrue_referral_on_charge
  AFTER UPDATE OF status ON public.platform_fee_charges
  FOR EACH ROW
  WHEN (NEW.status = 'charged' AND OLD.status IS DISTINCT FROM 'charged')
  EXECUTE FUNCTION public.accrue_referral_on_fee_charged();

------------------------------------------------------------------------------
-- 7. RLS
------------------------------------------------------------------------------

ALTER TABLE public.referral_links  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referral_links_party_or_admin_read ON public.referral_links;
CREATE POLICY referral_links_party_or_admin_read ON public.referral_links
  FOR SELECT USING (referrer_user_id = auth.uid() OR referred_user_id = auth.uid() OR public.is_admin());
-- Admin can write everything (the edge function uses service-role and bypasses RLS,
-- but in case a future PostgREST path is locked down: explicit policy.
DROP POLICY IF EXISTS referral_links_admin_write ON public.referral_links;
CREATE POLICY referral_links_admin_write ON public.referral_links
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS referral_ledger_party_or_admin_read ON public.referral_ledger;
CREATE POLICY referral_ledger_party_or_admin_read ON public.referral_ledger
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.referral_links rl
       WHERE rl.id = referral_ledger.referral_link_id
         AND (rl.referrer_user_id = auth.uid() OR rl.referred_user_id = auth.uid() OR public.is_admin())
    )
  );

------------------------------------------------------------------------------
-- 8. Status sync — when KYC flips on a driver/agent, update their referral_link
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_referral_link_on_kyc()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  new_status TEXT;
BEGIN
  IF NEW.kyc_status = OLD.kyc_status THEN RETURN NEW; END IF;

  IF NEW.kyc_status = 'approved' THEN
    new_status := 'verified';
  ELSIF NEW.kyc_status = 'rejected' THEN
    new_status := 'verification_rejected';
  ELSIF NEW.kyc_status IN ('docs_submitted', 'video_pending', 'ready_for_approval') THEN
    new_status := 'verification_pending';
  ELSE
    new_status := 'signed_up';
  END IF;

  UPDATE public.referral_links
     SET status = new_status
   WHERE referred_user_id = NEW.user_id
     -- only bump if we're still in a pre-earning state — never overwrite
     -- qualified/earning_active/cap_reached/suspended/rejected/expired
     AND status IN ('signed_up', 'verification_pending', 'verified', 'verification_rejected');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS drivers_sync_referral_link ON public.drivers;
CREATE TRIGGER drivers_sync_referral_link
  AFTER UPDATE OF kyc_status ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.sync_referral_link_on_kyc();

DROP TRIGGER IF EXISTS trip_managers_sync_referral_link ON public.trip_managers;
CREATE TRIGGER trip_managers_sync_referral_link
  AFTER UPDATE OF kyc_status ON public.trip_managers
  FOR EACH ROW EXECUTE FUNCTION public.sync_referral_link_on_kyc();

------------------------------------------------------------------------------
-- 8b. Mirror users.referred_by_user_id into referral_links on every new signup
--     (the backfill above handled existing rows; this trigger handles new ones)
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.sync_referral_link_from_users()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.referred_by_user_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.referred_by_user_id IS NOT DISTINCT FROM NEW.referred_by_user_id THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.referral_links (referrer_user_id, referred_user_id, referred_user_role, status)
  VALUES (NEW.referred_by_user_id, NEW.id, COALESCE(NEW.role, 'driver'), 'signed_up')
  ON CONFLICT (referred_user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_sync_referral_link ON public.users;
CREATE TRIGGER users_sync_referral_link
  AFTER INSERT OR UPDATE OF referred_by_user_id ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_referral_link_from_users();

------------------------------------------------------------------------------
-- 9. Comments
------------------------------------------------------------------------------

COMMENT ON TABLE public.referral_links IS
  'One row per referrer ↔ referred pair. cap_paise + payout_per_trip_paise are SNAPSHOTS at qualification (Stage 5 will snapshot from referral_tiers based on the referrer''s rank at the moment of qualification). status moves through 12 values; see CHECK constraint.';
COMMENT ON TABLE public.referral_ledger IS
  'Append-only earnings ledger. UNIQUE (referral_link_id, trip_id, entry_type) makes accrual idempotent. Stage 7 adds withdrawal_id FK to withdrawals.';
COMMENT ON FUNCTION public.accrue_referral_on_fee_charged IS
  'AFTER INSERT/UPDATE on platform_fee_charges. When a fee row hits status=charged AND payment_source ∈ eligible list AND payer has a referrer AND referred user is KYC-approved AND link is not in a terminal state → credits the referrer''s ledger with min(payout_per_trip_paise, remaining cap). Bumps status to earning_active on first credit, cap_reached when total hits cap.';

ANALYZE public.referral_links;
ANALYZE public.referral_ledger;
