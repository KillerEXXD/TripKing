-- 044_platform_fee_charging_dual_side_and_app_wallet.sql
-- Stage 3 of the referral program. Adds:
--   * platform_fee_charges — one row PER SIDE PER TRIP (driver + agent both pay)
--   * app_wallet_ledger    — TripKing's accounts receivable; one credit per fee charge
--   * app_wallet_balance   — view: total in / out
--   * AFTER UPDATE trigger on trips: when status flips to 'completed', charge BOTH
--     sides atomically. If either side has insufficient balance, RAISE EXCEPTION
--     which rolls back the entire UPDATE — trips edge fn catches and returns
--     INSUFFICIENT_WALLET_BALANCE_{DRIVER,AGENT}.
--
-- Source priority per side (matches Stage 6 admin-configurable order):
--   promo → transferred → cash
-- The first sub-balance with sufficient funds pays the WHOLE fee (no mixing).
-- The `payment_source` recorded on platform_fee_charges drives Stage 4 referral eligibility.
--
-- Spec: docs/REFERRAL_PROGRAM_REQUIREMENTS.md §10 (dual-side fee), §8.2 (App Wallet).
-- Plan: docs/REFERRAL_IMPLEMENTATION_PLAN.md Stage 3.

------------------------------------------------------------------------------
-- 1. platform_fee_charges
------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.platform_fee_charges (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id               UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  side                  TEXT NOT NULL CHECK (side IN ('driver', 'agent')),
  payer_user_id         UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  amount_paise          BIGINT NOT NULL CHECK (amount_paise >= 0),
  payment_source        TEXT NOT NULL CHECK (payment_source IN (
                          'cash_wallet', 'direct_upi', 'promo_credit',
                          'earnings_transfer_credit', 'admin_bonus', 'coupon'
                        )),
  sub_balance_used      TEXT NOT NULL CHECK (sub_balance_used IN ('promo', 'transferred', 'cash')),
  cash_wallet_ledger_id UUID REFERENCES public.cash_wallet_ledger(id),
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'charged', 'failed', 'refunded')),
  failure_reason        TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- exactly one charge per (trip, side) — idempotency on trigger re-run
  UNIQUE (trip_id, side)
);

CREATE INDEX IF NOT EXISTS platform_fee_charges_trip_idx     ON public.platform_fee_charges (trip_id);
CREATE INDEX IF NOT EXISTS platform_fee_charges_payer_idx    ON public.platform_fee_charges (payer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_fee_charges_status_idx   ON public.platform_fee_charges (status, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_fee_charges_side_source_idx ON public.platform_fee_charges (side, payment_source);

CREATE OR REPLACE FUNCTION public.touch_platform_fee_charges_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;
DROP TRIGGER IF EXISTS platform_fee_charges_touch ON public.platform_fee_charges;
CREATE TRIGGER platform_fee_charges_touch
  BEFORE UPDATE ON public.platform_fee_charges
  FOR EACH ROW EXECUTE FUNCTION public.touch_platform_fee_charges_updated_at();

------------------------------------------------------------------------------
-- 2. app_wallet_ledger — platform's accounts receivable
------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.app_wallet_ledger (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_type               TEXT NOT NULL CHECK (entry_type IN ('fee_credit', 'refund_debit', 'adjustment')),
  amount_paise             BIGINT NOT NULL,  -- signed; + on credit, − on refund
  platform_fee_charge_id   UUID REFERENCES public.platform_fee_charges(id) ON DELETE SET NULL,
  note                     TEXT,
  actor_admin_user_id      UUID REFERENCES public.users(id) ON DELETE SET NULL,  -- non-null on adjustments
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_wallet_ledger_created_idx ON public.app_wallet_ledger (created_at DESC);
CREATE INDEX IF NOT EXISTS app_wallet_ledger_fee_idx     ON public.app_wallet_ledger (platform_fee_charge_id);

CREATE OR REPLACE VIEW public.app_wallet_balance AS
SELECT
  COALESCE(SUM(amount_paise), 0)::BIGINT                                                              AS total_paise,
  COALESCE(SUM(amount_paise) FILTER (WHERE entry_type = 'fee_credit'), 0)::BIGINT                     AS lifetime_collected_paise,
  COALESCE(SUM(amount_paise) FILTER (WHERE entry_type = 'refund_debit'), 0)::BIGINT                   AS lifetime_refunded_paise,
  COUNT(*)                                                                                            AS entries
FROM public.app_wallet_ledger;

------------------------------------------------------------------------------
-- 3. The dual-side fee-charging trigger
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.pick_payment_source(
  _promo BIGINT, _transferred BIGINT, _cash BIGINT, _fee BIGINT,
  OUT sub_balance TEXT, OUT payment_source TEXT
) LANGUAGE plpgsql AS $$
BEGIN
  IF _promo >= _fee THEN
    sub_balance := 'promo';       payment_source := 'promo_credit';
  ELSIF _transferred >= _fee THEN
    sub_balance := 'transferred'; payment_source := 'earnings_transfer_credit';
  ELSIF _cash >= _fee THEN
    sub_balance := 'cash';        payment_source := 'cash_wallet';
  ELSE
    sub_balance := NULL; payment_source := NULL;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.charge_platform_fee_on_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  agent_uid UUID;
  driver_uid UUID;
  driver_fee BIGINT;
  agent_fee BIGINT;
  driver_wallet_id UUID;
  agent_wallet_id UUID;
  drv_promo BIGINT; drv_xfer BIGINT; drv_cash BIGINT;
  agt_promo BIGINT; agt_xfer BIGINT; agt_cash BIGINT;
  drv_sub TEXT; drv_src TEXT;
  agt_sub TEXT; agt_src TEXT;
  drv_fee_id UUID; agt_fee_id UUID;
  drv_ledger_id UUID; agt_ledger_id UUID;
BEGIN
  -- Only act on transitions into 'completed'
  IF NEW.status <> 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  -- Idempotency: if charges already exist for this trip, skip silently. The trigger
  -- can only really run once per UPDATE that flips to 'completed', but a stuck retry
  -- shouldn't double-charge.
  PERFORM 1 FROM public.platform_fee_charges WHERE trip_id = NEW.id LIMIT 1;
  IF FOUND THEN RETURN NEW; END IF;

  -- Resolve users
  agent_uid := NEW.posted_by_user_id;
  IF agent_uid IS NULL THEN
    RAISE EXCEPTION 'TRIP_HAS_NO_AGENT: trips.posted_by_user_id is null';
  END IF;
  IF NEW.assigned_driver_id IS NULL THEN
    RAISE EXCEPTION 'TRIP_HAS_NO_DRIVER: cannot complete a trip without an assigned driver';
  END IF;
  SELECT user_id INTO driver_uid FROM public.drivers WHERE id = NEW.assigned_driver_id;
  IF driver_uid IS NULL THEN
    RAISE EXCEPTION 'DRIVER_NOT_FOUND: driver row not found for assigned_driver_id %', NEW.assigned_driver_id;
  END IF;

  -- Read configured fees
  SELECT driver_platform_fee_paise, agent_platform_fee_paise
    INTO driver_fee, agent_fee
    FROM public.wallet_settings WHERE id = 1;
  IF driver_fee IS NULL OR agent_fee IS NULL THEN
    RAISE EXCEPTION 'WALLET_SETTINGS_MISSING: wallet_settings row 1 not found';
  END IF;

  -- Ensure wallets + read balances (lock the wallet rows for the duration of this txn)
  driver_wallet_id := public.ensure_cash_wallet(driver_uid);
  agent_wallet_id  := public.ensure_cash_wallet(agent_uid);

  -- Lock the wallets for write so concurrent fee charges (unlikely but possible if an
  -- admin-triggered retry races with the natural completion) don't both succeed when
  -- only one wallet has enough.
  PERFORM 1 FROM public.cash_wallets WHERE id = driver_wallet_id FOR UPDATE;
  PERFORM 1 FROM public.cash_wallets WHERE id = agent_wallet_id  FOR UPDATE;

  -- Read sub-balances from the view (recomputed inside the locked txn)
  SELECT promo_paise, transferred_paise, cash_paise
    INTO drv_promo, drv_xfer, drv_cash
    FROM public.cash_wallet_balances WHERE user_id = driver_uid;
  SELECT promo_paise, transferred_paise, cash_paise
    INTO agt_promo, agt_xfer, agt_cash
    FROM public.cash_wallet_balances WHERE user_id = agent_uid;

  -- Pick source per side
  SELECT * INTO drv_sub, drv_src FROM public.pick_payment_source(drv_promo, drv_xfer, drv_cash, driver_fee);
  SELECT * INTO agt_sub, agt_src FROM public.pick_payment_source(agt_promo, agt_xfer, agt_cash, agent_fee);

  -- Atomic: if EITHER side is insufficient, fail the whole update (no debit on either side)
  IF drv_sub IS NULL THEN
    RAISE EXCEPTION 'INSUFFICIENT_WALLET_BALANCE_DRIVER: driver wallet has % paise total (need %)', (drv_promo + drv_xfer + drv_cash), driver_fee;
  END IF;
  IF agt_sub IS NULL THEN
    RAISE EXCEPTION 'INSUFFICIENT_WALLET_BALANCE_AGENT: agent wallet has % paise total (need %)', (agt_promo + agt_xfer + agt_cash), agent_fee;
  END IF;

  -- Insert pending fee rows (UNIQUE(trip_id, side) — idempotency net)
  INSERT INTO public.platform_fee_charges (trip_id, side, payer_user_id, amount_paise, payment_source, sub_balance_used, status)
    VALUES (NEW.id, 'driver', driver_uid, driver_fee, drv_src, drv_sub, 'pending')
    RETURNING id INTO drv_fee_id;
  INSERT INTO public.platform_fee_charges (trip_id, side, payer_user_id, amount_paise, payment_source, sub_balance_used, status)
    VALUES (NEW.id, 'agent',  agent_uid,  agent_fee,  agt_src, agt_sub, 'pending')
    RETURNING id INTO agt_fee_id;

  -- Debit each wallet (signed: -fee)
  INSERT INTO public.cash_wallet_ledger (wallet_id, entry_type, sub_balance, amount_paise, payment_source, reference_type, reference_id, note)
    VALUES (driver_wallet_id, 'fee_debit', drv_sub, -driver_fee, drv_src, 'platform_fee_charge', drv_fee_id::TEXT,
            format('Driver-side platform fee · trip %s', NEW.id))
    RETURNING id INTO drv_ledger_id;
  INSERT INTO public.cash_wallet_ledger (wallet_id, entry_type, sub_balance, amount_paise, payment_source, reference_type, reference_id, note)
    VALUES (agent_wallet_id, 'fee_debit', agt_sub, -agent_fee, agt_src, 'platform_fee_charge', agt_fee_id::TEXT,
            format('Agent-side platform fee · trip %s', NEW.id))
    RETURNING id INTO agt_ledger_id;

  -- Mark fees charged + link the cash-wallet ledger row
  UPDATE public.platform_fee_charges SET status = 'charged', cash_wallet_ledger_id = drv_ledger_id WHERE id = drv_fee_id;
  UPDATE public.platform_fee_charges SET status = 'charged', cash_wallet_ledger_id = agt_ledger_id WHERE id = agt_fee_id;

  -- Credit App Wallet (one row per side)
  INSERT INTO public.app_wallet_ledger (entry_type, amount_paise, platform_fee_charge_id, note)
    VALUES ('fee_credit', driver_fee, drv_fee_id, format('Driver-side fee · trip %s', NEW.id));
  INSERT INTO public.app_wallet_ledger (entry_type, amount_paise, platform_fee_charge_id, note)
    VALUES ('fee_credit', agent_fee,  agt_fee_id, format('Agent-side fee · trip %s', NEW.id));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trips_charge_platform_fee_on_complete ON public.trips;
CREATE TRIGGER trips_charge_platform_fee_on_complete
  AFTER UPDATE OF status ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.charge_platform_fee_on_complete();

------------------------------------------------------------------------------
-- 4. RLS
------------------------------------------------------------------------------

ALTER TABLE public.platform_fee_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_wallet_ledger    ENABLE ROW LEVEL SECURITY;

-- Payer can read their own fee charges; admin reads all
DROP POLICY IF EXISTS platform_fee_charges_payer_or_admin_read ON public.platform_fee_charges;
CREATE POLICY platform_fee_charges_payer_or_admin_read ON public.platform_fee_charges
  FOR SELECT USING (payer_user_id = auth.uid() OR public.is_admin());

-- App Wallet ledger is admin-only
DROP POLICY IF EXISTS app_wallet_ledger_admin_only_read ON public.app_wallet_ledger;
CREATE POLICY app_wallet_ledger_admin_only_read ON public.app_wallet_ledger
  FOR SELECT USING (public.is_admin());

------------------------------------------------------------------------------
-- 5. Comments
------------------------------------------------------------------------------

COMMENT ON TABLE public.platform_fee_charges IS
  'One row PER SIDE PER COMPLETED TRIP — Driver pays driver_platform_fee_paise, Agent pays agent_platform_fee_paise (both from wallet_settings). UNIQUE(trip_id, side) makes the dual-side trigger idempotent.';
COMMENT ON TABLE public.app_wallet_ledger IS
  'TripKing''s accounts receivable. Every platform fee debited from a user''s cash wallet credits this ledger. Admin-only RLS.';
COMMENT ON FUNCTION public.charge_platform_fee_on_complete IS
  'AFTER UPDATE OF status trigger on trips. When status flips to completed, charges Driver and Agent fees atomically (per source priority promo→transferred→cash). RAISE EXCEPTION on either side''s insufficient balance rolls back the whole UPDATE — surfaced to the trips edge fn as INSUFFICIENT_WALLET_BALANCE_{DRIVER,AGENT}.';

ANALYZE public.platform_fee_charges;
ANALYZE public.app_wallet_ledger;
