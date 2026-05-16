-- 048_withdrawals.sql
-- Stage 7 of the referral program. Adds:
--   * withdrawals table — one row per UPI withdrawal request
--   * referral_ledger.withdrawal_id FK back to withdrawals (was reserved in 045)
--   * referral_withdrawable view — hold-aware: only accruals older than
--     wallet_settings.withdrawal_hold_days count toward "withdrawable"
--   * request_referral_withdrawal(_user_id, _amount_paise, _upi_id) — atomic
--     stored procedure: validates min, monthly cap, hold-filtered withdrawable;
--     inserts withdrawals row + paired referral_ledger.withdrawal debit
--   * complete_withdrawal(_withdrawal_id, _outcome, _admin_actor_id, _txn_ref) —
--     admin path: outcome ∈ paid|rejected|cancelled|failed. paid leaves the debit
--     in place; the others insert an offsetting reversal row + restore the funds.
--
-- Spec: docs/REFERRAL_PROGRAM_REQUIREMENTS.md §14 (statuses), §16.7 (withdraw panel).
-- Plan: docs/REFERRAL_IMPLEMENTATION_PLAN.md Stage 7.

------------------------------------------------------------------------------
-- 1. withdrawals table
------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.withdrawals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  amount_paise          BIGINT NOT NULL CHECK (amount_paise > 0),
  upi_id                TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'requested' CHECK (status IN (
                          'requested', 'approved', 'processing', 'paid',
                          'rejected', 'cancelled', 'failed'
                        )),
  provider              TEXT NOT NULL DEFAULT 'razorpay' CHECK (provider IN ('razorpay','cashfree','manual')),
  provider_payout_id    TEXT,
  external_txn_ref      TEXT,
  rejected_reason       TEXT,
  admin_actor_user_id   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  requested_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at           TIMESTAMPTZ,
  paid_at               TIMESTAMPTZ,
  failed_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS withdrawals_user_idx     ON public.withdrawals (user_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS withdrawals_status_idx   ON public.withdrawals (status, requested_at DESC);
CREATE INDEX IF NOT EXISTS withdrawals_provider_payout_uq ON public.withdrawals (provider_payout_id) WHERE provider_payout_id IS NOT NULL;

-- One pending withdrawal per user at a time — eliminates the race where two
-- concurrent requests both see "enough withdrawable" and both spend.
CREATE UNIQUE INDEX IF NOT EXISTS withdrawals_one_pending_per_user
  ON public.withdrawals (user_id)
  WHERE status IN ('requested', 'approved', 'processing');

-- Wire the FK reserved in 045
ALTER TABLE public.referral_ledger
  DROP CONSTRAINT IF EXISTS referral_ledger_withdrawal_id_fkey;
ALTER TABLE public.referral_ledger
  ADD CONSTRAINT referral_ledger_withdrawal_id_fkey
    FOREIGN KEY (withdrawal_id) REFERENCES public.withdrawals(id) ON DELETE SET NULL;

-- The Stage-4 UNIQUE NULLS NOT DISTINCT (link, trip, entry_type) was designed for
-- accrual idempotency — but it inadvertently blocks multiple withdrawals/transfers/
-- reversals on the same link (trip_id is NULL for those, treated as equal). Replace
-- with a partial UNIQUE that only constrains accruals.
ALTER TABLE public.referral_ledger
  DROP CONSTRAINT IF EXISTS referral_ledger_referral_link_id_trip_id_entry_type_key;
DROP INDEX IF EXISTS public.referral_ledger_referral_link_id_trip_id_entry_type_key;
CREATE UNIQUE INDEX IF NOT EXISTS referral_ledger_accrual_unique
  ON public.referral_ledger (referral_link_id, trip_id)
  WHERE entry_type = 'accrual';

------------------------------------------------------------------------------
-- 2. referral_withdrawable view — hold-aware withdrawable balance per user
------------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.referral_withdrawable AS
WITH cfg AS (
  SELECT withdrawal_hold_days, new_user_withdrawal_delay_days,
         min_withdrawal_paise, daily_withdrawal_cap_paise,
         driver_monthly_withdrawal_cap_paise, agent_monthly_withdrawal_cap_paise
    FROM public.wallet_settings WHERE id = 1
),
links AS (
  SELECT id, referrer_user_id FROM public.referral_links
)
SELECT
  links.referrer_user_id AS user_id,
  -- Mature accruals: older than withdrawal_hold_days
  COALESCE(SUM(led.amount_paise) FILTER (
    WHERE led.entry_type = 'accrual'
      AND led.created_at <= now() - (cfg.withdrawal_hold_days * INTERVAL '1 day')
  ), 0)::BIGINT AS mature_accruals_paise,
  -- Pending accruals: still in the hold window
  COALESCE(SUM(led.amount_paise) FILTER (
    WHERE led.entry_type = 'accrual'
      AND led.created_at >  now() - (cfg.withdrawal_hold_days * INTERVAL '1 day')
  ), 0)::BIGINT AS pending_accruals_paise,
  -- Withdrawals (negative entries — already debited)
  COALESCE(SUM(led.amount_paise) FILTER (WHERE led.entry_type = 'withdrawal'), 0)::BIGINT AS withdrawn_paise,
  -- Transfers out (negative — already debited)
  COALESCE(SUM(led.amount_paise) FILTER (WHERE led.entry_type = 'transfer_to_cash_wallet'), 0)::BIGINT AS transferred_paise,
  -- Reversals (positive — restored funds)
  COALESCE(SUM(led.amount_paise) FILTER (WHERE led.entry_type = 'reversal'), 0)::BIGINT AS reversed_paise
FROM links
CROSS JOIN cfg
LEFT JOIN public.referral_ledger led ON led.referral_link_id = links.id
GROUP BY links.referrer_user_id, cfg.withdrawal_hold_days;

-- A simpler one for the API: the actual withdrawable amount, capped at 0
CREATE OR REPLACE VIEW public.referral_withdrawable_summary AS
SELECT
  user_id,
  mature_accruals_paise,
  pending_accruals_paise,
  withdrawn_paise,
  transferred_paise,
  reversed_paise,
  GREATEST(
    0,
    mature_accruals_paise + reversed_paise + withdrawn_paise + transferred_paise
  )::BIGINT AS withdrawable_paise
FROM public.referral_withdrawable;

------------------------------------------------------------------------------
-- 3. Request stored procedure
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.request_referral_withdrawal(
  _user_id UUID,
  _amount_paise BIGINT,
  _upi_id TEXT
) RETURNS TABLE (
  out_withdrawal_id UUID,
  out_amount_paise BIGINT,
  out_status TEXT,
  out_withdrawable_remaining_paise BIGINT
)
LANGUAGE plpgsql
AS $$
DECLARE
  cfg RECORD;
  user_role TEXT;
  monthly_cap BIGINT;
  spent_this_month BIGINT;
  spent_today BIGINT;
  user_signup_age_days INT;
  withdrawable_now BIGINT;
  link_ids UUID[];
  largest_link_id UUID;
  new_id UUID;
BEGIN
  IF _amount_paise IS NULL OR _amount_paise <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: amount_paise must be > 0 (got %)', _amount_paise;
  END IF;
  IF _upi_id IS NULL OR length(trim(_upi_id)) < 3 THEN
    RAISE EXCEPTION 'INVALID_UPI_ID: upi_id required';
  END IF;

  SELECT * INTO cfg FROM public.wallet_settings WHERE id = 1;

  -- Min withdrawal
  IF _amount_paise < cfg.min_withdrawal_paise THEN
    RAISE EXCEPTION 'BELOW_MIN_WITHDRAWAL: amount % < min %', _amount_paise, cfg.min_withdrawal_paise;
  END IF;

  -- New-user delay (account age)
  SELECT EXTRACT(EPOCH FROM (now() - created_at)) / 86400 INTO user_signup_age_days
    FROM public.users WHERE id = _user_id;
  IF user_signup_age_days < cfg.new_user_withdrawal_delay_days THEN
    RAISE EXCEPTION 'NEW_USER_WITHDRAWAL_DELAY: account is % days old (need %)', user_signup_age_days::INT, cfg.new_user_withdrawal_delay_days;
  END IF;

  -- Daily cap
  SELECT COALESCE(SUM(w.amount_paise), 0)::BIGINT INTO spent_today
    FROM public.withdrawals w
   WHERE w.user_id = _user_id
     AND w.status IN ('requested', 'approved', 'processing', 'paid')
     AND w.requested_at > now() - INTERVAL '1 day';
  IF (spent_today + _amount_paise) > cfg.daily_withdrawal_cap_paise THEN
    RAISE EXCEPTION 'DAILY_CAP_EXCEEDED: today % + req % > cap %', spent_today, _amount_paise, cfg.daily_withdrawal_cap_paise;
  END IF;

  -- Monthly cap (per role: driver / trip_manager)
  SELECT u.role INTO user_role FROM public.users u WHERE u.id = _user_id;
  monthly_cap := CASE WHEN user_role = 'trip_manager' THEN cfg.agent_monthly_withdrawal_cap_paise
                      ELSE cfg.driver_monthly_withdrawal_cap_paise END;
  SELECT COALESCE(SUM(w.amount_paise), 0)::BIGINT INTO spent_this_month
    FROM public.withdrawals w
   WHERE w.user_id = _user_id
     AND w.status IN ('requested', 'approved', 'processing', 'paid')
     AND w.requested_at > now() - INTERVAL '30 days';
  IF (spent_this_month + _amount_paise) > monthly_cap THEN
    RAISE EXCEPTION 'MONTHLY_CAP_EXCEEDED: this month % + req % > cap %', spent_this_month, _amount_paise, monthly_cap;
  END IF;

  -- Lock the user's referral_links so we read a consistent withdrawable view
  SELECT array_agg(id) INTO link_ids FROM public.referral_links WHERE referrer_user_id = _user_id;
  IF link_ids IS NULL OR array_length(link_ids, 1) = 0 THEN
    RAISE EXCEPTION 'NO_REFERRALS: user has no referral links';
  END IF;
  PERFORM 1 FROM public.referral_links WHERE id = ANY(link_ids) FOR UPDATE;

  -- Read hold-aware withdrawable from the view (recomputed under lock)
  SELECT COALESCE(withdrawable_paise, 0) INTO withdrawable_now
    FROM public.referral_withdrawable_summary WHERE user_id = _user_id;
  IF withdrawable_now < _amount_paise THEN
    RAISE EXCEPTION 'INSUFFICIENT_WITHDRAWABLE: have % paise (mature + adjustments), need %', withdrawable_now, _amount_paise;
  END IF;

  -- Insert the withdrawal row (the partial UNIQUE index enforces single-pending)
  INSERT INTO public.withdrawals (user_id, amount_paise, upi_id)
  VALUES (_user_id, _amount_paise, trim(_upi_id))
  RETURNING id INTO new_id;

  -- Insert the referral_ledger debit on the largest link (so the debit follows
  -- the same convention as the transfer procedure)
  SELECT rl.id INTO largest_link_id FROM public.referral_links rl
   WHERE rl.id = ANY(link_ids)
   ORDER BY (
     SELECT COALESCE(SUM(amount_paise), 0)
       FROM public.referral_ledger WHERE referral_link_id = rl.id
   ) DESC
   LIMIT 1;
  INSERT INTO public.referral_ledger (referral_link_id, entry_type, amount_paise, withdrawal_id, note)
  VALUES (largest_link_id, 'withdrawal', -_amount_paise, new_id,
          format('Withdrawal request to %s · ₹%s', trim(_upi_id), (_amount_paise/100)::TEXT));

  out_withdrawal_id := new_id;
  out_amount_paise := _amount_paise;
  out_status := 'requested';
  SELECT COALESCE(withdrawable_paise, 0) INTO out_withdrawable_remaining_paise
    FROM public.referral_withdrawable_summary WHERE user_id = _user_id;
  RETURN NEXT;
END;
$$;

------------------------------------------------------------------------------
-- 4. Admin completion stored procedure
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_referral_withdrawal(
  _withdrawal_id UUID,
  _outcome TEXT,                  -- 'approved' | 'paid' | 'rejected' | 'cancelled' | 'failed'
  _admin_actor_user_id UUID,
  _provider_payout_id TEXT DEFAULT NULL,
  _external_txn_ref TEXT DEFAULT NULL,
  _rejected_reason TEXT DEFAULT NULL
) RETURNS public.withdrawals
LANGUAGE plpgsql
AS $$
DECLARE
  w RECORD;
  reversal_link_id UUID;
  result public.withdrawals;
BEGIN
  IF _outcome NOT IN ('approved', 'processing', 'paid', 'rejected', 'cancelled', 'failed') THEN
    RAISE EXCEPTION 'INVALID_OUTCOME: %', _outcome;
  END IF;

  SELECT * INTO w FROM public.withdrawals WHERE id = _withdrawal_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: withdrawal %', _withdrawal_id; END IF;
  IF w.status IN ('paid', 'rejected', 'cancelled', 'failed') THEN
    RAISE EXCEPTION 'TERMINAL_STATUS: withdrawal already %', w.status;
  END IF;

  IF _outcome IN ('rejected', 'cancelled', 'failed') THEN
    -- Insert the reversal entry on the same link as the original debit
    SELECT referral_link_id INTO reversal_link_id
      FROM public.referral_ledger WHERE withdrawal_id = _withdrawal_id AND entry_type = 'withdrawal'
      LIMIT 1;
    IF reversal_link_id IS NOT NULL THEN
      INSERT INTO public.referral_ledger (referral_link_id, entry_type, amount_paise, withdrawal_id, note)
      VALUES (reversal_link_id, 'reversal', w.amount_paise, _withdrawal_id,
              format('Withdrawal %s — funds restored', _outcome));
    END IF;
  END IF;

  UPDATE public.withdrawals SET
    status = _outcome,
    admin_actor_user_id = _admin_actor_user_id,
    provider_payout_id = COALESCE(_provider_payout_id, provider_payout_id),
    external_txn_ref = COALESCE(_external_txn_ref, external_txn_ref),
    rejected_reason = COALESCE(_rejected_reason, rejected_reason),
    approved_at = CASE WHEN _outcome IN ('approved','processing','paid') AND approved_at IS NULL THEN now() ELSE approved_at END,
    paid_at = CASE WHEN _outcome = 'paid' THEN now() ELSE paid_at END,
    failed_at = CASE WHEN _outcome IN ('rejected','cancelled','failed') THEN now() ELSE failed_at END
  WHERE id = _withdrawal_id
  RETURNING * INTO result;

  RETURN result;
END;
$$;

------------------------------------------------------------------------------
-- 5. RLS
------------------------------------------------------------------------------

ALTER TABLE public.withdrawals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS withdrawals_owner_or_admin_read ON public.withdrawals;
CREATE POLICY withdrawals_owner_or_admin_read ON public.withdrawals
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS withdrawals_admin_write ON public.withdrawals;
CREATE POLICY withdrawals_admin_write ON public.withdrawals
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

------------------------------------------------------------------------------
-- 6. Comments
------------------------------------------------------------------------------

COMMENT ON TABLE public.withdrawals IS
  'UPI withdrawal requests. Partial UNIQUE on (user_id) WHERE status IN (requested,approved,processing) — at most one pending per user. provider_payout_id maps to Razorpay/Cashfree on success.';
COMMENT ON VIEW public.referral_withdrawable_summary IS
  'Per-user withdrawable balance with hold-period filter applied. Reads wallet_settings.withdrawal_hold_days; only accruals older than that count toward mature_accruals_paise. Used by request_referral_withdrawal and the API.';
COMMENT ON FUNCTION public.request_referral_withdrawal IS
  'Atomic withdrawal request. Validates: min, daily cap, monthly cap (per-role), new-user delay, hold-aware withdrawable. Inserts withdrawals row + paired ledger debit. Partial UNIQUE on withdrawals enforces single-pending.';
COMMENT ON FUNCTION public.complete_referral_withdrawal IS
  'Admin transitions a withdrawal: approved/processing/paid/rejected/cancelled/failed. Terminal failure outcomes insert a reversal ledger entry to restore funds.';

ANALYZE public.withdrawals;
