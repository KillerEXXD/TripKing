-- 043_cash_wallet_and_promo_grant.sql
-- Stage 2 of the referral program. Adds:
--   * cash_wallets — one row per user
--   * cash_wallet_ledger — append-only ledger; sub_balance ∈ {promo, cash, transferred}
--   * cash_wallet_topups — Razorpay top-up tracking
--   * cash_wallet_balances — view: per-user totals + sub-balance breakdown
--   * wallet_settings — single-row table with the four Stage-2/3 admin knobs
--                        (driver/agent platform fees, driver/agent onboarding promo grants).
--                        Stage 5 extends this with the rest of the wallet/withdrawal config.
--   * promo grant trigger on driver / trip_manager profile creation, idempotent on
--     (user_id, recipient_role)
--   * one-shot backfill for every existing approved/pending driver and agent
--
-- Spec: docs/REFERRAL_PROGRAM_REQUIREMENTS.md §7 (launch credit), §8 (sub-balances).
-- Plan: docs/REFERRAL_IMPLEMENTATION_PLAN.md Stage 2.

------------------------------------------------------------------------------
-- 1. wallet_settings — single-row table (id=1 enforced by CHECK)
--    Stage 5 will add CRUD endpoints + the rest of the columns. This migration
--    just lands the four knobs Stage 2 + Stage 3 need to read.
------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.wallet_settings (
  id                                INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  -- Stage 3 will read these on every fee charge (defaults: ₹50 each)
  driver_platform_fee_paise         INT NOT NULL DEFAULT 5000   CHECK (driver_platform_fee_paise >= 0),
  agent_platform_fee_paise          INT NOT NULL DEFAULT 5000   CHECK (agent_platform_fee_paise >= 0),
  -- Stage 2 promo-grant trigger reads these on profile creation (defaults: ₹1,000 each)
  driver_signup_promo_credit_paise  INT NOT NULL DEFAULT 100000 CHECK (driver_signup_promo_credit_paise >= 0),
  agent_signup_promo_credit_paise   INT NOT NULL DEFAULT 100000 CHECK (agent_signup_promo_credit_paise >= 0),
  updated_at                        TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.wallet_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- updated_at touch
CREATE OR REPLACE FUNCTION public.touch_wallet_settings_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS wallet_settings_touch_updated_at ON public.wallet_settings;
CREATE TRIGGER wallet_settings_touch_updated_at
  BEFORE UPDATE ON public.wallet_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_wallet_settings_updated_at();

------------------------------------------------------------------------------
-- 2. cash_wallets — one row per user (created lazily by the wallet edge fn or
--    the promo trigger, whichever fires first)
------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cash_wallets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.touch_cash_wallets_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS cash_wallets_touch_updated_at ON public.cash_wallets;
CREATE TRIGGER cash_wallets_touch_updated_at
  BEFORE UPDATE ON public.cash_wallets
  FOR EACH ROW EXECUTE FUNCTION public.touch_cash_wallets_updated_at();

------------------------------------------------------------------------------
-- 3. cash_wallet_ledger — the append-only source of truth
--    sub_balance lets us bleed the right "kind" of money on each fee debit
--    (Stage 3 + Stage 6).
------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cash_wallet_ledger (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id       UUID NOT NULL REFERENCES public.cash_wallets(id) ON DELETE CASCADE,
  entry_type      TEXT NOT NULL CHECK (entry_type IN (
                    'topup',
                    'fee_debit',
                    'refund',
                    'transfer_in_from_referral',
                    'promo_credit_grant',
                    'adjustment'
                  )),
  -- Which sub-balance this entry credits or debits.
  -- 'promo'       — the launch credit / future promo balance (non-withdrawable, non-referral-eligible)
  -- 'transferred' — moved across from a user's released referral earnings (Stage 6; non-referral-eligible)
  -- 'cash'        — real money the user paid in (referral-eligible)
  sub_balance     TEXT NOT NULL CHECK (sub_balance IN ('promo', 'transferred', 'cash')),
  amount_paise    BIGINT NOT NULL,  -- signed: + on credit, − on debit
  payment_source  TEXT CHECK (payment_source IS NULL OR payment_source IN (
                    'direct_upi',
                    'direct_card',
                    'cash_wallet',
                    'promo_credit',
                    'earnings_transfer_credit',
                    'admin_bonus',
                    'coupon',
                    'launch_credit'
                  )),
  reference_type  TEXT,             -- e.g. 'razorpay_payment', 'platform_fee_charge', 'referral_transfer'
  reference_id    TEXT,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cash_wallet_ledger_wallet_idx
  ON public.cash_wallet_ledger (wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cash_wallet_ledger_wallet_sub_idx
  ON public.cash_wallet_ledger (wallet_id, sub_balance);
CREATE INDEX IF NOT EXISTS cash_wallet_ledger_reference_idx
  ON public.cash_wallet_ledger (reference_type, reference_id);

------------------------------------------------------------------------------
-- 4. cash_wallet_topups — one row per Razorpay/Cashfree top-up attempt
--    (Razorpay integration is stubbed for now; this table is ready for it).
------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cash_wallet_topups (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  amount_paise        BIGINT NOT NULL CHECK (amount_paise > 0),
  provider            TEXT NOT NULL DEFAULT 'razorpay' CHECK (provider IN ('razorpay', 'cashfree', 'manual')),
  provider_order_id   TEXT,
  provider_payment_id TEXT UNIQUE,  -- the idempotency key for Razorpay verify + webhook
  status              TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'pending', 'succeeded', 'failed', 'refunded')),
  failure_reason      TEXT,
  ledger_entry_id     UUID REFERENCES public.cash_wallet_ledger(id),  -- set on succeeded
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cash_wallet_topups_user_idx ON public.cash_wallet_topups (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cash_wallet_topups_status_idx ON public.cash_wallet_topups (status, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_cash_wallet_topups_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS cash_wallet_topups_touch_updated_at ON public.cash_wallet_topups;
CREATE TRIGGER cash_wallet_topups_touch_updated_at
  BEFORE UPDATE ON public.cash_wallet_topups
  FOR EACH ROW EXECUTE FUNCTION public.touch_cash_wallet_topups_updated_at();

------------------------------------------------------------------------------
-- 5. cash_wallet_balances — per-user view computed from the ledger
------------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.cash_wallet_balances AS
SELECT
  w.id AS wallet_id,
  w.user_id,
  COALESCE(SUM(l.amount_paise) FILTER (WHERE l.sub_balance = 'promo'), 0)::BIGINT       AS promo_paise,
  COALESCE(SUM(l.amount_paise) FILTER (WHERE l.sub_balance = 'transferred'), 0)::BIGINT AS transferred_paise,
  COALESCE(SUM(l.amount_paise) FILTER (WHERE l.sub_balance = 'cash'), 0)::BIGINT        AS cash_paise,
  COALESCE(SUM(l.amount_paise), 0)::BIGINT                                              AS total_paise
FROM public.cash_wallets w
LEFT JOIN public.cash_wallet_ledger l ON l.wallet_id = w.id
GROUP BY w.id, w.user_id;

------------------------------------------------------------------------------
-- 6. promo_credit_grants — tracks who got which grant; idempotent
------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.promo_credit_grants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  recipient_role  TEXT NOT NULL CHECK (recipient_role IN ('driver', 'trip_manager')),
  amount_paise    BIGINT NOT NULL,
  ledger_entry_id UUID NOT NULL REFERENCES public.cash_wallet_ledger(id),
  granted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, recipient_role)
);

CREATE INDEX IF NOT EXISTS promo_credit_grants_user_idx ON public.promo_credit_grants (user_id);

------------------------------------------------------------------------------
-- 7. Helpers — find-or-create the user's wallet, grant the promo
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ensure_cash_wallet(_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  wid UUID;
BEGIN
  SELECT id INTO wid FROM public.cash_wallets WHERE user_id = _user_id;
  IF wid IS NULL THEN
    INSERT INTO public.cash_wallets (user_id) VALUES (_user_id)
    ON CONFLICT (user_id) DO NOTHING
    RETURNING id INTO wid;
    -- conflict path
    IF wid IS NULL THEN
      SELECT id INTO wid FROM public.cash_wallets WHERE user_id = _user_id;
    END IF;
  END IF;
  RETURN wid;
END;
$$;

/**
 * Grant the launch credit for a (user_id, recipient_role) pair. No-op if
 * already granted (UNIQUE on promo_credit_grants enforces this).
 * Returns true if a grant was newly issued, false if it was already present.
 */
CREATE OR REPLACE FUNCTION public.grant_signup_promo_credit(
  _user_id UUID,
  _recipient_role TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  amount BIGINT;
  wid UUID;
  ledger_id UUID;
BEGIN
  IF _recipient_role NOT IN ('driver', 'trip_manager') THEN
    RAISE EXCEPTION 'INVALID_RECIPIENT_ROLE: %', _recipient_role;
  END IF;

  -- skip if already granted (most common path on profile re-creation)
  PERFORM 1 FROM public.promo_credit_grants WHERE user_id = _user_id AND recipient_role = _recipient_role;
  IF FOUND THEN RETURN false; END IF;

  -- read the configured amount
  IF _recipient_role = 'driver' THEN
    SELECT driver_signup_promo_credit_paise INTO amount FROM public.wallet_settings WHERE id = 1;
  ELSE
    SELECT agent_signup_promo_credit_paise INTO amount FROM public.wallet_settings WHERE id = 1;
  END IF;
  IF amount IS NULL OR amount <= 0 THEN
    -- explicitly disabled by admin → no grant, no error
    RETURN false;
  END IF;

  wid := public.ensure_cash_wallet(_user_id);

  INSERT INTO public.cash_wallet_ledger (wallet_id, entry_type, sub_balance, amount_paise, payment_source, reference_type, note)
  VALUES (wid, 'promo_credit_grant', 'promo', amount, 'launch_credit', 'signup_promo_grant',
          format('Welcome to TripKing — ₹%s launch credit (%s)', (amount/100)::TEXT, _recipient_role))
  RETURNING id INTO ledger_id;

  INSERT INTO public.promo_credit_grants (user_id, recipient_role, amount_paise, ledger_entry_id)
  VALUES (_user_id, _recipient_role, amount, ledger_id)
  ON CONFLICT (user_id, recipient_role) DO NOTHING;

  RETURN true;
END;
$$;

------------------------------------------------------------------------------
-- 8. Triggers — grant on driver / trip_manager profile creation
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.grant_promo_on_driver_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.grant_signup_promo_credit(NEW.user_id, 'driver');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS drivers_grant_signup_promo ON public.drivers;
CREATE TRIGGER drivers_grant_signup_promo
  AFTER INSERT ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.grant_promo_on_driver_insert();

CREATE OR REPLACE FUNCTION public.grant_promo_on_agent_insert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.grant_signup_promo_credit(NEW.user_id, 'trip_manager');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trip_managers_grant_signup_promo ON public.trip_managers;
CREATE TRIGGER trip_managers_grant_signup_promo
  AFTER INSERT ON public.trip_managers
  FOR EACH ROW EXECUTE FUNCTION public.grant_promo_on_agent_insert();

------------------------------------------------------------------------------
-- 9. Backfill: every existing driver and trip_manager profile gets its grant
------------------------------------------------------------------------------

DO $$
DECLARE
  r RECORD;
  granted INT := 0;
BEGIN
  FOR r IN SELECT user_id FROM public.drivers WHERE user_id IS NOT NULL LOOP
    IF public.grant_signup_promo_credit(r.user_id, 'driver') THEN granted := granted + 1; END IF;
  END LOOP;
  RAISE NOTICE 'Backfilled % driver promo grants', granted;
END;
$$;

DO $$
DECLARE
  r RECORD;
  granted INT := 0;
BEGIN
  FOR r IN SELECT user_id FROM public.trip_managers WHERE user_id IS NOT NULL LOOP
    IF public.grant_signup_promo_credit(r.user_id, 'trip_manager') THEN granted := granted + 1; END IF;
  END LOOP;
  RAISE NOTICE 'Backfilled % agent promo grants', granted;
END;
$$;

------------------------------------------------------------------------------
-- 10. RLS
------------------------------------------------------------------------------

ALTER TABLE public.wallet_settings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_wallets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_wallet_ledger     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_wallet_topups     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_credit_grants    ENABLE ROW LEVEL SECURITY;

-- wallet_settings: anyone can read defaults (the UI may need them); admins write
DROP POLICY IF EXISTS wallet_settings_read_all ON public.wallet_settings;
CREATE POLICY wallet_settings_read_all ON public.wallet_settings FOR SELECT USING (true);
DROP POLICY IF EXISTS wallet_settings_admin_write ON public.wallet_settings;
CREATE POLICY wallet_settings_admin_write ON public.wallet_settings FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- cash_wallets / ledger / topups: owner reads own; admin reads all; writes via SECURITY DEFINER fns only
DROP POLICY IF EXISTS cash_wallets_owner_read     ON public.cash_wallets;
CREATE POLICY cash_wallets_owner_read     ON public.cash_wallets     FOR SELECT USING (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS cash_wallet_ledger_owner_read ON public.cash_wallet_ledger;
CREATE POLICY cash_wallet_ledger_owner_read ON public.cash_wallet_ledger FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.cash_wallets w WHERE w.id = cash_wallet_ledger.wallet_id AND (w.user_id = auth.uid() OR public.is_admin()))
);
DROP POLICY IF EXISTS cash_wallet_topups_owner_read ON public.cash_wallet_topups;
CREATE POLICY cash_wallet_topups_owner_read ON public.cash_wallet_topups FOR SELECT USING (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS promo_credit_grants_owner_read ON public.promo_credit_grants;
CREATE POLICY promo_credit_grants_owner_read ON public.promo_credit_grants FOR SELECT USING (user_id = auth.uid() OR public.is_admin());

------------------------------------------------------------------------------
-- 11. Comments
------------------------------------------------------------------------------

COMMENT ON TABLE  public.wallet_settings        IS 'Single-row admin-configurable settings for the cash wallet + per-side platform fees + onboarding promo amounts. Stage 5 will add CRUD endpoints + the rest of the columns (withdrawal limits, source priority, etc.).';
COMMENT ON TABLE  public.cash_wallets           IS 'One row per user. The wallet itself; balances live in cash_wallet_balances (view) computed from the ledger.';
COMMENT ON TABLE  public.cash_wallet_ledger     IS 'Append-only ledger. sub_balance ∈ {promo, transferred, cash} drives the source-priority bleed in Stage 6 and the referral-eligibility check in Stage 4.';
COMMENT ON TABLE  public.cash_wallet_topups     IS 'Razorpay/Cashfree top-up tracking. Idempotent on provider_payment_id.';
COMMENT ON TABLE  public.promo_credit_grants    IS 'Tracks the signup launch credit per (user, role). UNIQUE (user_id, recipient_role) makes the grant idempotent so re-running the trigger or backfill never double-credits.';
COMMENT ON VIEW   public.cash_wallet_balances   IS 'Per-user wallet totals broken down by sub-balance. Read by the wallet edge function and the Stage 3 fee-charging trigger.';

ANALYZE public.cash_wallets;
ANALYZE public.cash_wallet_ledger;
ANALYZE public.cash_wallet_topups;
ANALYZE public.promo_credit_grants;
