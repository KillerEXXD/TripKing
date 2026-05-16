-- 051_referral_polish_and_launch.sql
-- Stage 10 of the referral program. Adds:
--   * Wire is_high_risk into the withdrawable view (Stage 9 column, Stage 7 hold)
--     — high-risk users wait extra `high_risk_extra_hold_days` (fraud_settings)
--     before accruals mature.
--   * fire_referral_released_notifications() cron — every 15 minutes, finds
--     accruals that JUST matured (crossed the hold-days boundary) and fires
--     the referral_released notification to the referrer.
--   * Seed referral_settings.terms_markdown + faq_markdown with launch copy.
--   * Performance: a few hot-path indexes the earlier migrations missed.
--   * ANALYZE everything.
--
-- This is the last backend stage. Frontend lane (Stage 10 FE) does the T&C/FAQ
-- markdown render + onboarding-carousel slide + cross-link to the tour explainer.

------------------------------------------------------------------------------
-- 1. Refactor referral_withdrawable to honour users.is_high_risk
------------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.referral_withdrawable AS
WITH cfg AS (
  SELECT ws.withdrawal_hold_days, ws.new_user_withdrawal_delay_days,
         ws.min_withdrawal_paise, ws.daily_withdrawal_cap_paise,
         ws.driver_monthly_withdrawal_cap_paise, ws.agent_monthly_withdrawal_cap_paise,
         fs.high_risk_extra_hold_days
    FROM public.wallet_settings ws
   CROSS JOIN public.fraud_settings fs
   WHERE ws.id = 1 AND fs.id = 1
),
links AS (
  SELECT id, referrer_user_id FROM public.referral_links
)
SELECT
  links.referrer_user_id AS user_id,
  -- Mature accruals: older than (hold_days + high_risk_extra_hold_days if user is high-risk)
  COALESCE(SUM(led.amount_paise) FILTER (
    WHERE led.entry_type = 'accrual'
      AND led.created_at <= now() - (
        (cfg.withdrawal_hold_days + (CASE WHEN u.is_high_risk THEN cfg.high_risk_extra_hold_days ELSE 0 END))
        * INTERVAL '1 day'
      )
  ), 0)::BIGINT AS mature_accruals_paise,
  COALESCE(SUM(led.amount_paise) FILTER (
    WHERE led.entry_type = 'accrual'
      AND led.created_at >  now() - (
        (cfg.withdrawal_hold_days + (CASE WHEN u.is_high_risk THEN cfg.high_risk_extra_hold_days ELSE 0 END))
        * INTERVAL '1 day'
      )
  ), 0)::BIGINT AS pending_accruals_paise,
  COALESCE(SUM(led.amount_paise) FILTER (WHERE led.entry_type = 'withdrawal'), 0)::BIGINT AS withdrawn_paise,
  COALESCE(SUM(led.amount_paise) FILTER (WHERE led.entry_type = 'transfer_to_cash_wallet'), 0)::BIGINT AS transferred_paise,
  COALESCE(SUM(led.amount_paise) FILTER (WHERE led.entry_type = 'reversal'), 0)::BIGINT AS reversed_paise
FROM links
CROSS JOIN cfg
JOIN public.users u ON u.id = links.referrer_user_id
LEFT JOIN public.referral_ledger led ON led.referral_link_id = links.id
GROUP BY links.referrer_user_id, u.is_high_risk, cfg.withdrawal_hold_days, cfg.high_risk_extra_hold_days;

-- referral_withdrawable_summary unchanged (reads from the view above)

------------------------------------------------------------------------------
-- 2. referral_released notification cron
--    Tracks last-run time on referral_settings (single row) so we only fire for
--    accruals that crossed the maturity boundary since the previous run.
------------------------------------------------------------------------------

ALTER TABLE public.referral_settings
  ADD COLUMN IF NOT EXISTS last_released_notif_run_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.fire_referral_released_notifications()
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  hold_days INT;
  last_run TIMESTAMPTZ;
  cutoff TIMESTAMPTZ;
  prev_cutoff TIMESTAMPTZ;
  notif_count INT := 0;
  r RECORD;
BEGIN
  SELECT withdrawal_hold_days INTO hold_days FROM public.wallet_settings WHERE id = 1;
  IF hold_days IS NULL THEN RETURN 0; END IF;
  SELECT last_released_notif_run_at INTO last_run FROM public.referral_settings WHERE id = 1;

  cutoff      := now() - (hold_days * INTERVAL '1 day');
  prev_cutoff := last_run - (hold_days * INTERVAL '1 day');

  -- Sum per referrer of accruals that crossed maturity between prev_cutoff and cutoff
  FOR r IN
    SELECT rl.referrer_user_id AS uid, SUM(led.amount_paise)::BIGINT AS matured_paise
      FROM public.referral_ledger led
      JOIN public.referral_links  rl ON rl.id = led.referral_link_id
     WHERE led.entry_type = 'accrual'
       AND led.created_at > prev_cutoff
       AND led.created_at <= cutoff
     GROUP BY rl.referrer_user_id
    HAVING SUM(led.amount_paise) > 0
  LOOP
    PERFORM public.notify_referral_event(
      r.uid, 'referral_released',
      jsonb_build_object('amount', (r.matured_paise / 100)::TEXT, 'holdDays', hold_days::TEXT)
    );
    notif_count := notif_count + 1;
  END LOOP;

  UPDATE public.referral_settings SET last_released_notif_run_at = now() WHERE id = 1;
  RETURN notif_count;
END;
$$;

COMMENT ON FUNCTION public.fire_referral_released_notifications IS
  'Stage 10 cron. Every 15 minutes: for each referrer with accruals that crossed the maturity boundary since last run, fire one referral_released notification with the matured total. Tracks last-run timestamp on referral_settings to avoid duplicate fires.';

-- Schedule it
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'referrals_fire_released_notifications') THEN
    PERFORM cron.schedule(
      'referrals_fire_released_notifications',
      '*/15 * * * *',  -- every 15 minutes
      'select public.fire_referral_released_notifications()'
    );
  END IF;
END$$;

------------------------------------------------------------------------------
-- 3. Seed launch T&C + FAQ markdown on referral_settings
------------------------------------------------------------------------------

UPDATE public.referral_settings
   SET terms_markdown = $md$
# Referral Program — Terms

By participating in the TripKing Referral Program you agree to the following:

1. **No reward for signup alone.** You earn only from real trips your referral completes.
2. **Verification is required.** Your referral must complete TripKing's existing KYC process before any earning starts.
3. **Promotional credits don't earn.** Launch credits and other promotional balances cover platform fees but do not generate referral payouts for you.
4. **Real money triggers payouts.** Only platform fees paid from Cash Wallet (UPI top-ups) or direct UPI/card on a completed trip earn you ₹50.
5. **Transferred earnings don't compound.** If you move your referral earnings into your Cash Wallet, that money can pay your own platform fees — but it will NOT generate new referral payouts (anti-circular rule).
6. **Caps apply.** Per-referral caps depend on your tier (1–10 qualified → ₹2,500; 11–25 → ₹3,500; 26–50 → ₹5,000; 51+ admin-set).
7. **Hold period.** Each ₹50 sits in a 3-day hold before becoming withdrawable. High-risk accounts may have an extended hold.
8. **Disputes and fraud.** Disputed or cancelled trips don't earn. Fraud (duplicate Aadhaar/UPI/device, self-referral, suspicious patterns) can suspend a referral and reverse paid earnings.
9. **Withdrawals.** Minimum ₹500 to UPI. Drivers: up to ₹5,000/month. Agents: up to ₹10,000/month. Admin approval may be required.
10. **TripKing reserves the right** to modify, suspend, or end the program, and to delay or reject suspicious payouts. Changes apply prospectively.
$md$,
       faq_markdown = $md$
# Referral Program — FAQ

**Q. Do I earn when someone signs up?**
A. No. You earn only when your referral becomes verified, finishes any launch credits, and completes real paid trips.

**Q. When do earnings start?**
A. After your referral's KYC is approved AND they start paying platform fees from real money (Cash Wallet top-ups or direct UPI/card on a trip).

**Q. How much can I earn?**
A. ₹50 per eligible paid trip, up to your tier cap (₹2,500 / ₹3,500 / ₹5,000 / admin-set).

**Q. Can I withdraw my launch credit?**
A. No — launch credits are non-withdrawable. Only released referral earnings are withdrawable.

**Q. What if my balance is "pending"?**
A. Each ₹50 sits in a 3-day hold before clearing. High-risk accounts may wait longer.

**Q. Can my referral be rejected?**
A. Yes — for duplicate Aadhaar/UPI/device, self-referral, fake documents, or suspicious trip patterns. Suspended referrals can be reversed by admin.

**Q. Why are some of my earnings ₹0?**
A. The fee was paid from a non-eligible source (promotional credit, transferred earnings, admin bonus, coupon). Only real-money fees mint payouts.
$md$
 WHERE id = 1
   AND (terms_markdown = '' OR faq_markdown = '');

------------------------------------------------------------------------------
-- 4. Performance: hot-path indexes the earlier migrations missed
------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS referral_ledger_created_at_idx
  ON public.referral_ledger (created_at DESC);
CREATE INDEX IF NOT EXISTS referral_ledger_link_type_idx
  ON public.referral_ledger (referral_link_id, entry_type);
CREATE INDEX IF NOT EXISTS app_wallet_ledger_fee_type_idx
  ON public.app_wallet_ledger (entry_type, created_at DESC);
CREATE INDEX IF NOT EXISTS cash_wallet_ledger_entry_type_idx
  ON public.cash_wallet_ledger (entry_type, created_at DESC);

ANALYZE public.referral_links;
ANALYZE public.referral_ledger;
ANALYZE public.platform_fee_charges;
ANALYZE public.app_wallet_ledger;
ANALYZE public.cash_wallet_ledger;
ANALYZE public.withdrawals;
ANALYZE public.referral_fraud_flags;
