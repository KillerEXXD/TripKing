-- 047_earnings_transfer.sql
-- Stage 6 of the referral program. Adds:
--   * transfer_referral_to_cash_wallet(_user_id, _amount_paise) — atomic stored
--     procedure that moves money from withdrawable referral earnings into the
--     user's cash_wallet (transferred sub-balance). FOR UPDATE on both wallets.
--
-- The anti-circular rule itself (a fee paid from the transferred sub-balance does
-- NOT mint a new referral payout) is ALREADY enforced as of Stage 5:
--   - Stage 3's pick_payment_source returns sub_balance='transferred' +
--     payment_source='earnings_transfer_credit' when the priority bleeds the
--     transferred bucket.
--   - Stage 5's fee_source_is_referral_eligible reads wallet_settings.
--     eligible_payment_sources_for_referral, which defaults to
--     ['cash_wallet', 'direct_upi'] — 'earnings_transfer_credit' is NOT in there.
-- This migration just adds the transfer mechanic and tests the round-trip.
--
-- Spec: docs/REFERRAL_PROGRAM_REQUIREMENTS.md §9 (transfer to Trip Wallet),
--       §11 (deduction order), §13 rules 5–7 (eligible-paid trip).
-- Plan: docs/REFERRAL_IMPLEMENTATION_PLAN.md Stage 6.

CREATE OR REPLACE FUNCTION public.transfer_referral_to_cash_wallet(
  _user_id UUID,
  _amount_paise BIGINT
) RETURNS TABLE (
  transferred_paise BIGINT,
  new_referral_withdrawable_paise BIGINT,
  new_cash_wallet_total_paise BIGINT,
  new_cash_wallet_transferred_paise BIGINT,
  cash_wallet_ledger_id UUID,
  referral_ledger_id UUID
)
LANGUAGE plpgsql
AS $$
DECLARE
  total_links INT;
  withdrawable BIGINT;
  link_row RECORD;
  remaining BIGINT;
  draw BIGINT;
  cw_ledger UUID;
  ref_ledger UUID;
  cw_id UUID;
  cw_bal RECORD;
  link_ids UUID[];
BEGIN
  IF _amount_paise IS NULL OR _amount_paise <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: amount_paise must be > 0 (got %)', _amount_paise;
  END IF;

  -- Lock the user's cash wallet first (or create it), then collect + lock all
  -- their referral_links. Lock order: cash_wallets → referral_links → ledger
  -- so concurrent transfers + accruals don't deadlock.
  cw_id := public.ensure_cash_wallet(_user_id);
  PERFORM 1 FROM public.cash_wallets WHERE id = cw_id FOR UPDATE;

  SELECT array_agg(id) INTO link_ids FROM public.referral_links WHERE referrer_user_id = _user_id;
  IF link_ids IS NULL THEN
    RAISE EXCEPTION 'NO_REFERRALS: user has no referral links';
  END IF;
  PERFORM 1 FROM public.referral_links WHERE id = ANY(link_ids) FOR UPDATE;

  -- Compute current withdrawable inside the locked txn (Stage 7 will tighten with
  -- a hold-period filter; for now withdrawable = lifetime − transfers − withdrawals
  -- − reversals).
  SELECT COALESCE(SUM(amount_paise), 0)::BIGINT INTO withdrawable
    FROM public.referral_ledger
   WHERE referral_link_id = ANY(link_ids);
  IF withdrawable < _amount_paise THEN
    RAISE EXCEPTION 'INSUFFICIENT_REFERRAL_BALANCE: withdrawable % < requested %', withdrawable, _amount_paise;
  END IF;

  -- Debit each link in turn until we cover _amount_paise. Strategy: take from the
  -- link with the largest positive net first (so we drain mature links before new
  -- ones); this minimises status churn.
  remaining := _amount_paise;
  FOR link_row IN
    SELECT rl.id,
           COALESCE(SUM(led.amount_paise), 0)::BIGINT AS net
      FROM public.referral_links rl
      LEFT JOIN public.referral_ledger led ON led.referral_link_id = rl.id
     WHERE rl.id = ANY(link_ids)
     GROUP BY rl.id
    HAVING COALESCE(SUM(led.amount_paise), 0)::BIGINT > 0
     ORDER BY net DESC
  LOOP
    EXIT WHEN remaining <= 0;
    draw := LEAST(remaining, link_row.net);
    INSERT INTO public.referral_ledger (referral_link_id, entry_type, amount_paise, note)
    VALUES (link_row.id, 'transfer_to_cash_wallet', -draw,
            format('Transfer to Cash Wallet · ₹%s', (draw/100)::TEXT))
    RETURNING id INTO ref_ledger;
    remaining := remaining - draw;
  END LOOP;

  IF remaining > 0 THEN
    -- Should be unreachable given the withdrawable check, but defence in depth
    RAISE EXCEPTION 'TRANSFER_DRAW_INCOMPLETE: % paise remaining', remaining;
  END IF;

  -- Credit the cash wallet (transferred sub-balance)
  INSERT INTO public.cash_wallet_ledger (
    wallet_id, entry_type, sub_balance, amount_paise, payment_source,
    reference_type, reference_id, note
  ) VALUES (
    cw_id, 'transfer_in_from_referral', 'transferred', _amount_paise, NULL,
    'referral_transfer', ref_ledger::TEXT,
    format('Transferred from referral earnings · ₹%s', (_amount_paise/100)::TEXT)
  )
  RETURNING id INTO cw_ledger;

  -- Recompute balances for the response
  SELECT COALESCE(SUM(amount_paise), 0)::BIGINT INTO withdrawable
    FROM public.referral_ledger
   WHERE referral_link_id = ANY(link_ids);
  SELECT cwb.total_paise AS total_paise, cwb.transferred_paise AS transferred_paise INTO cw_bal
    FROM public.cash_wallet_balances cwb WHERE cwb.user_id = _user_id;

  -- This procedure returns ONE row.
  transferred_paise := _amount_paise;
  new_referral_withdrawable_paise := withdrawable;
  new_cash_wallet_total_paise := COALESCE(cw_bal.total_paise, 0);
  new_cash_wallet_transferred_paise := COALESCE(cw_bal.transferred_paise, 0);
  cash_wallet_ledger_id := cw_ledger;
  referral_ledger_id := ref_ledger;
  total_links := array_length(link_ids, 1);
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.transfer_referral_to_cash_wallet IS
  'Atomically move money from a user''s withdrawable referral earnings into their cash_wallet (transferred sub-balance). FOR UPDATE on both ledgers; raises INSUFFICIENT_REFERRAL_BALANCE / INVALID_AMOUNT / NO_REFERRALS. The transferred funds spend BEFORE cash on the next platform fee (per wallet_settings.payment_source_priority), and that fee carries payment_source=earnings_transfer_credit which is NOT in eligible_payment_sources_for_referral — so it does NOT mint another referral payout. That is the anti-circular enforcement.';
