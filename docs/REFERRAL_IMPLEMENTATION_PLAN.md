# Referral Program — Implementation Plan

> **Source of truth for what to build:** [REFERRAL_PROGRAM_REQUIREMENTS.md](./REFERRAL_PROGRAM_REQUIREMENTS.md).
> **Live prototype** (mock-only, what users will see): trip-king-tour repo — `/refer` (12-screen explainer), `/driver/referrals`, `/agent/referrals`, `/admin/referral-program`.
> **Status:** Stage 0 (tour explainer) and the live prototype are merged in `KillerEXXD/TripKing-tour`. Stages 1–10 are the backend + frontend build inside this repo.

---

## Context

The referral program requires three net-new economic systems on top of the referral feature itself:

1. **Platform fee charging.** TripKing has `trips.commission_pct` and `driver_payout` computed, but **no platform fee is actually charged today**. Without a real fee event there is no "eligible paid trip" signal to fire referral accrual on.
2. **Cash Wallet.** Users top up real money (UPI/card via Razorpay) and use it to pay platform fees. This wallet is the source-of-truth that distinguishes "real money" from promo credits.
3. **Payment-source tracking.** Every platform-fee debit must record its source (cash wallet / direct UPI / promo credit / earnings-transfer credit / admin bonus / coupon). Only `cash_wallet` and `direct_upi` are referral-eligible. This is what prevents circular payouts and promo-credit abuse.

On top of those, the referral system itself contributes: attribution + tier-based qualification + per-trip accrual + cap enforcement + referrer dashboards + admin config + UPI withdrawals + Earnings Transfer Credit + fraud controls.

**Confirmed scope decisions:**
- Wallet, platform-fee charging, payment-source tracking — all **net-new and in scope**.
- Promo credits **do not exist today** — placeholder hook in the gate; real promo ledger is future.
- Driver/Agent verification **already exists** — read `kyc_status='approved'`; do not rebuild.
- Migrations slot in starting at **042** (latest is 041).
- Razorpay (or Cashfree) is required for top-ups and payouts; merchant onboarding is assumed complete.

---

## Architectural foundations (apply to every stage)

- **Server-computed everything.** Tier, qualification, accrual, cap, balances, eligibility — all derived in Postgres or edge functions. Per CLAUDE.md §0.7.
- **Three ledgers, each its own source of truth:**
  - `cash_wallet_ledger` — top-ups, fee debits, transfer-in from referral.
  - `referral_ledger` — accruals, withdrawals, transfers-out, reversals.
  - `platform_fee_charges` — one row per completed-trip fee, with `payment_source` enum.
  - Balances are SUMs over ledgers. No floating "balance" column.
- **Triggers, not cron, for fee charging and accrual.** Fee-charge trigger fires on `trips.status → completed`; accrual trigger fires on `platform_fee_charges` insert with `status='charged'`.
- **Idempotency:** `platform_fee_charges.trip_id` UNIQUE; `referral_ledger UNIQUE(referral_link_id, trip_id, entry_type)`.
- **Real money via Razorpay.** No card data on our servers. Webhook-verified. Idempotent on `provider_payment_id`.
- **System enums vs admin-configurable** (CLAUDE.md §7): payment-source kinds, ledger entry types, statuses → `CHECK` constraints. Tier slots, gates, withdrawal limits, source-eligibility flags → DB rows.
- **Verification is read-only consumption.** Refer to `drivers.kyc_status='approved'` / `trip_managers.kyc_status='approved'`. No new tables.
- **Reuse admin pattern.** New `/administration/*` sections slot into [src/pages/administration/AdminConfigPage.tsx](../src/pages/administration/AdminConfigPage.tsx) `SECTIONS` array.
- **Configurability default: prefer DB over code.** If a number, threshold, list, copy string, or rule could plausibly need tweaking after launch, make it a row in the settings tables. Hardcoding is the exception. Full inventory below.

---

## Configurability Inventory

Everything below is **admin-editable via `/administration`** with audit logging. Triggers, edge functions, and UI all read from these tables.

### A. Referral economics (`referral_tiers` rows + `referral_settings` row)

| Knob | Default | Stored in |
|---|---|---|
| Tier slot ranges (min..max qualified referrals) | 1–10, 11–25, 26–50, 51+ | `referral_tiers` |
| Cap per referral, per tier | ₹2,500 / ₹3,500 / ₹5,000 / configurable | `referral_tiers.cap_paise` |
| **Payout per eligible trip, per tier** (NOT a single global ₹50) | ₹50 / ₹50 / ₹50 / configurable | `referral_tiers.payout_per_trip_paise` |
| Tier `applies_to_role` (driver / trip_manager / both) | both | `referral_tiers.applies_to_role` |
| Tier `applies_retroactively` | false | `referral_tiers.applies_retroactively` |
| Active campaign date range per tier | NULL = always-on | `referral_tiers.active_from`/`active_to` |
| Per-pair caps and payouts (D→D vs D→A etc.) | uniform | `referral_tiers.applies_to_pair` JSONB (NULL = all) |
| Program globally active | true | `referral_settings.program_active` |
| Program date range | unbounded | `referral_settings.program_starts_at`/`ends_at` |
| Pair flags: D→D, D→A, A→D, A→A | all true | `referral_settings.pair_*` |
| Min eligible paid trips for qualification | 5 | `referral_settings.min_eligible_paid_trips_for_qualification` |
| Min fare per trip to count | ₹500 | `referral_settings.min_trip_fare_paise_for_accrual` |
| Min trip distance to count | 10 km | `referral_settings.min_trip_distance_km_for_accrual` |
| Dispute-free days before accrual releases | 3 | `referral_settings.dispute_free_days` |
| Requires admin approval at qualification | false | `referral_settings.requires_admin_approval` |
| Requires promo-credit exhaustion (placeholder) | false | `referral_settings.requires_promo_exhausted` |
| Referral qualification expiry (days) | 90 | `referral_settings.referral_qualification_expiry_days` |
| Per-user max active referrals | unlimited | `referral_settings.max_active_referrals_per_user` |
| Per-user max new referrals per month | unlimited | `referral_settings.max_new_referrals_per_user_per_month` |
| Welcome bonus to referred user on signup | ₹0 | `referral_settings.welcome_bonus_paise` |
| Welcome bonus to referrer on each new signup | ₹0 | `referral_settings.referrer_signup_bonus_paise` |

### B. Wallet & withdrawals (`wallet_settings` row)

| Knob | Default | Stored in |
|---|---|---|
| Top-up min / max-per-txn / max-per-day | ₹50 / ₹50,000 / ₹100,000 | `wallet_settings.{min_topup,max_topup_per_txn,max_topup_per_user_per_day}_paise` |
| Top-up preset amounts (UI) | [100, 250, 500, 1000] | `wallet_settings.topup_presets_paise` JSONB |
| Transfer-to-wallet preset amounts | [100, 250, 500, 1000] | `wallet_settings.transfer_presets_paise` JSONB |
| Min withdrawal | ₹500 | `wallet_settings.min_withdrawal_paise` |
| Driver / Agent monthly withdrawal cap | ₹5,000 / ₹10,000 | `wallet_settings.{driver,agent}_monthly_withdrawal_cap_paise` |
| Daily withdrawal cap (per user) | ₹2,000 | `wallet_settings.daily_withdrawal_cap_paise` |
| Withdrawal hold days | 3 | `wallet_settings.withdrawal_hold_days` |
| Withdrawal requires admin approval | true | `wallet_settings.requires_admin_approval` |
| New-user withdrawal delay | 7 days | `wallet_settings.new_user_withdrawal_delay_days` |
| Payout provider / method | razorpay / UPI | `wallet_settings.payout_provider`, `payout_method` |
| **Eligible payment sources for referral accrual** | [`cash_wallet`, `direct_upi`] | `wallet_settings.eligible_payment_sources_for_referral` JSONB |
| **Payment source priority** (debit order) | [promo, transferred, cash_wallet] | `wallet_settings.payment_source_priority` JSONB |
| Default platform fee % | 10% | `wallet_settings.default_platform_fee_pct` |

### C. Fraud & risk (`fraud_settings` row + `fraud_action_rules` table)

| Knob | Default | Stored in |
|---|---|---|
| Auto-flag: duplicate Aadhaar across N accounts | 2 | `fraud_settings.duplicate_aadhaar_threshold` |
| Auto-flag: duplicate UPI across N accounts | 2 | `fraud_settings.duplicate_upi_threshold` |
| Auto-flag: same agent-driver pair on N+ trips/30d | 20 | `fraud_settings.same_pair_trip_threshold` |
| Auto-flag: signup velocity (N referrals/24h) | 5 | `fraud_settings.signup_velocity_threshold` |
| Severity → action mapping | high=suspend, med=hold, low=flag | `fraud_action_rules` table |
| High-risk-user withdrawal hold extension | +14 days | `fraud_settings.high_risk_extra_hold_days` |
| Reversal grace period after dispute resolution | 24h | `fraud_settings.reversal_grace_hours` |
| Auto-resolve flags older than (low severity) | 30 days | `fraud_settings.auto_resolve_low_severity_days` |

### D. Notifications & copy (`notification_templates` table)

| Knob | Default | Stored in |
|---|---|---|
| Template per type (title + body, with `{vars}`) | seeded English copy | `notification_templates(type, locale, title, body)` |
| Per-locale templates (i18n) | en seeded; ta/hi blank | same table |
| Channels enabled per type | in-app only at launch | `notification_templates.channels` JSONB |
| WhatsApp share message template | `"Join TripKing with my code {code}: {link}"` | `referral_settings.whatsapp_share_template` |
| Admin notification: high-payout-pending threshold | ₹10,000 | `referral_settings.admin_high_payout_threshold_paise` |

### E. Code & link issuance (`referral_settings` row)

| Knob | Default | Stored in |
|---|---|---|
| Referral code length | 8 | `referral_settings.code_length` |
| Referral code charset | base32 (Crockford) | `referral_settings.code_charset` |
| Referral link host | `tripkingapp.com/r/` | `referral_settings.referral_link_base` |
| Allow user to pick a custom code | false | `referral_settings.allow_custom_code` |
| Custom code min length | 5 | `referral_settings.custom_code_min_length` |

### F. Branding / program metadata (`referral_settings` row)

| Knob | Default | Stored in |
|---|---|---|
| Program display name | "TripKing Referral Rewards" | `referral_settings.program_name` |
| Currency code / symbol | INR / ₹ | `referral_settings.currency`, `currency_symbol` |
| T&C content (markdown) | seeded | `referral_settings.terms_markdown` |
| FAQ content (markdown) | seeded | `referral_settings.faq_markdown` |

### G. System enums (NOT configurable — `CHECK` constraints in code)

`users.role`, `referral_links.status` (12), `referral_ledger.entry_type` (5), `cash_wallet_ledger.entry_type` (5), `cash_wallet_ledger.payment_source` (7), `withdrawals.status` (7), `platform_fee_charges.status` (4), `referral_fraud_flags.flag_type` (7), KYC statuses.

Adding a new enum value = code change + migration. Toggling whether an existing one is **used** = config change.

---

## Stage 0 — Tour & Prototype (✅ shipped)

Live in `KillerEXXD/TripKing-tour`:

- **12-screen explainer** at `/refer` (PR #10 — merged).
- **Live prototype** at `/driver/referrals`, `/agent/referrals`, `/admin/referral-program` — full mock-only walkthrough of every component this plan will build (PR #11 — merged).

Use the prototype as the visual contract for Stages 1–10.

---

## Stage 1 — Attribution & Code Issuance

**Goal:** every Driver and Agent has a referral code; new signups attach a referrer; nothing pays out yet.

**DB (migration 042):**
- `users.referral_code` TEXT UNIQUE — auto-generated 8-char base32 via trigger. Backfill all existing users.
- `users.referred_by_user_id` UUID FK users(id) NULL — set once at signup, immutable thereafter (trigger guard). Block self-referral.
- Indexes: `users(referral_code)`, `users(referred_by_user_id)`.

**Edge functions:**
- Extend [supabase/functions/auth/index.ts](../supabase/functions/auth/index.ts) `verify-otp` (new-user path) to accept `referral_code` and resolve. Reject self-referral, unknown codes, second-time attribution.
- Extend [supabase/functions/drivers/index.ts](../supabase/functions/drivers/index.ts) and [supabase/functions/agents/index.ts](../supabase/functions/agents/index.ts) `GET /me` to return `referralCode` and a stub `referralSummary` of zeros.

**Frontend:**
- Service + transform + hook (`src/hooks/useReferral.ts`).
- Minimal "Your referral code" card on driver/agent home (copy + WhatsApp share). Optional `?ref=` URL pre-fill on signup.

**Tests:** transform unit tests; `scripts/test-referral-attribution.cjs`.

**Definition of done:** existing users backfilled with codes; new signups can attach a referrer; no payout logic exists.

---

## Stage 2 — Cash Wallet (top-up only)

**Goal:** users can top up real money via UPI/card and see their balance. No spending yet.

**DB (migration 043):**
- `cash_wallets` (one row per user): `id`, `user_id` UNIQUE, `is_active`, timestamps.
- `cash_wallet_ledger`: `id`, `wallet_id`, `entry_type` (CHECK), `amount_paise` (signed), `payment_source` (CHECK), `reference_type`, `reference_id`, `note`, `created_at`. Index `(wallet_id, created_at)`.
- `cash_wallet_topups`: `id`, `user_id`, `amount_paise`, `provider`, `provider_order_id`, `provider_payment_id`, `status` (CHECK), timestamps.
- View `cash_wallet_balances` = SUM(ledger).
- Sub-balance accounting via separate `transferred_in_paise` rollup (used in Stage 6 for source precedence).

**Razorpay integration:**
- `.env.development` adds `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
- New edge function `wallet`: `POST /wallet/topup/initiate`, `POST /wallet/topup/verify` (HMAC-verify signature, idempotent on `provider_payment_id`), `POST /wallet/webhook/razorpay`, `GET /wallet`.

**Frontend:** Types in `src/types/wallet.ts`; `useCashWallet` hook. `/wallet` page — balance card, "Add money" modal (presets), Razorpay Checkout SDK, ledger list.

**Tests:** signature-verification unit; `scripts/test-wallet-topup.cjs` against Razorpay test mode.

**Definition of done:** ₹500 top-up via Razorpay test mode appears in wallet, exactly one ledger row.

---

## Stage 3 — Platform Fee Charging at Trip Completion

**Goal:** every completed trip charges the agent's platform fee from cash wallet, recorded with `payment_source`. No referral accrual yet.

**DB (migration 044):**
- `platform_fee_charges`: `id`, `trip_id` FK UNIQUE, `payer_user_id`, `amount_paise`, `payment_source` (CHECK), `cash_wallet_ledger_id` FK NULL, `status` (CHECK), `failure_reason`, timestamps.
- Trigger on `trips` `AFTER UPDATE` when `status` → `completed`: insert pending fee row → debit cash wallet → mark charged. Insufficient balance → mark failed; **block the completion confirmation** server-side.

**Edge functions:** Extend `trips` to surface `INSUFFICIENT_WALLET_BALANCE`; expose `platformFeeAmountPaise` and `platformFeeStatus` on `trips` GET.

**Frontend:** Wallet-balance pill in agent header; low-balance warning; "Insufficient balance" modal at trip-completion → deep-link to `/wallet`. `/wallet/charges` receipts page.

**Tests:** trigger unit tests; `scripts/test-platform-fee.cjs`.

**Definition of done:** trip completes → fee debited → row written with `payment_source='cash_wallet'`. Insufficient balance blocks completion with clear error.

---

## Stage 4 — Referral Qualification & Per-Trip Accrual

**Goal:** referred users become qualified; ledger credits ₹50 to the referrer per **eligible** paid trip, up to cap. Single hardcoded tier (₹2,500, ₹50/trip) — admin config in Stage 5.

**DB (migration 045):**
- `referral_links`: `id`, `referrer_user_id`, `referred_user_id` UNIQUE, `referred_user_role` (CHECK), `status` (CHECK: 12 states), `qualified_at`, `cap_reached_at`, `eligible_paid_trips_count`, `total_earned_paise`, `cap_paise` (snapshot), `tier_slot_id` FK NULL, timestamps.
- `referral_ledger`: `id`, `referral_link_id` FK, `entry_type` (CHECK: 5 types), `amount_paise` (signed), `trip_id` FK NULL, `withdrawal_id` FK NULL, `cash_wallet_ledger_id` FK NULL, `note`, `created_at`. UNIQUE `(referral_link_id, trip_id, entry_type)`.
- View `referral_balances` per `user_id`: pending/released/transferred/withdrawn/withdrawable.
- Backfill `referral_links` from `users.referred_by_user_id`; status seeded from `kyc_status`.

**Eligibility logic — fires when `platform_fee_charges` is INSERTED with `status='charged'`:**
1. `payment_source` ∈ eligible list (Stage 5; for now hardcode `cash_wallet`/`direct_upi`).
2. Referred user's `kyc_status='approved'`.
3. Promo-exhausted gate — placeholder, currently always true.
4. Link status NOT in `cap_reached`/`suspended`/`rejected`/`expired`.
5. `total_earned_paise + payout ≤ cap_paise`.

If ALL pass → bump count, transition status, insert accrual, bump total. Cap reached → status `cap_reached`.

**Resolves both sides per trip:** the trip's driver AND the agent are both checked — each may have their own referrer. The ₹50 is per-side, per-trip.

**Edge functions:** new `referrals` function — `GET /me/referrals`, `GET /me/referrals/:id`.

**Tests:** `scripts/test-referral-accrual.cjs`.

**Definition of done:** referred driver/agent paying fees from cash wallet on 50 completed trips produces exactly ₹2,500 in referrer's ledger; cap enforced; ineligible sources don't accrue.

---

## Stage 5 — Admin Config (tiers, gates, source eligibility, settings)

**Goal:** admin edits everything from `/administration` without code changes.

**DB (migration 046)** — implements the full Configurability Inventory above. Five tables/rows:

- `referral_tiers` (rows): inventory §A "tier slot ranges" through "per-pair caps". Seed Tiers 1–4.
- `referral_settings` (single row, id=1 CHECK): every key from inventory §A (rest), §E, §F, plus the WhatsApp template + admin high-payout threshold from §D.
- `wallet_settings` (single row, id=1): every key from inventory §B.
- `fraud_settings` (single row, id=1): every key from inventory §C, except `fraud_action_rules` which is its own table.
- `fraud_action_rules` (rows): `flag_type`, `severity`, `action`, `auto_resolve_after_days` NULL.
- `notification_templates` (rows): per inventory §D.
- `admin_audit_log` row on every change.
- Stage 4 trigger and Stage 6 fee trigger read from these tables instead of hardcoded values.

**Edge function:** extend `admin` with CRUD endpoints for each: `/admin/referral-tiers`, `/admin/referral-settings`, `/admin/wallet-settings`, `/admin/fraud-settings`, `/admin/fraud-action-rules`, `/admin/notification-templates`.

**Frontend:** new `SECTIONS` entries in [AdminConfigPage.tsx](../src/pages/administration/AdminConfigPage.tsx) — Referral Tiers, Referral Settings, Wallet Settings, Fraud Settings, Fraud Action Rules, Notification Templates. Validation: tier ranges non-overlapping per role/pair; eligible-sources must include ≥1 real-money source; topup min ≤ max ≤ daily cap; action rules cover every (flag_type × severity) combo.

**Tests:** `scripts/test-admin-referral-config.cjs`.

**Definition of done:** admin edits Tier 2 cap → next qualification snapshot uses new value; admin removes a source → next charge with that source doesn't accrue.

---

## Stage 6 — Earnings Transfer to Cash Wallet + Source Precedence (anti-circular)

**Goal:** released referral earnings transfer into Cash Wallet (becoming non-withdrawable, non-referral-generating). Fee charging respects source precedence and rejects circular payouts.

**DB (migration 047):**
- Stored procedure `transfer_referral_to_cash_wallet(user_id, amount_paise)`: validates ≤ withdrawable, inserts paired ledger rows atomically (`SELECT … FOR UPDATE` on both wallets), returns new balances.
- Extend Stage 3 fee trigger:
  - Source priority from `wallet_settings.payment_source_priority` (default: promo → earnings-transfer-credit → cash-wallet).
  - Cash wallet tracks `transferred_in_paise` separately. When the chosen source is "earnings-transfer-credit" the debit still hits the cash wallet ledger but the `payment_source` written on `platform_fee_charges` is `earnings_transfer_credit` — Stage 4's eligibility check excludes that source. **This is the anti-circular enforcement.**

**Edge functions:** `referrals` adds `POST /me/referrals/transfer-to-wallet`. `wallet` GET surfaces `transferredFromReferralPaise` separately.

**Frontend:** "Transfer to Trip Wallet" panel on `/referrals` (presets + spec §22 warning verbatim). `/wallet` shows breakdown: real-money vs transferred-from-referral.

**Tests:** `scripts/test-earnings-transfer.cjs` — transfer succeeds; rejected when amount > withdrawable; **fee paid from transferred balance produces zero accrual** (the critical anti-circular test).

**Definition of done:** ₹2,500 transferred → next fee from that pot has source `earnings_transfer_credit` → referrer earns nothing.

---

## Stage 7 — Withdrawals (UPI Payout via Razorpay)

**Goal:** users withdraw released referral earnings to UPI.

**DB (migration 048):**
- `withdrawals`: `id`, `user_id`, `amount_paise`, `upi_id`, `status` (CHECK: 7 states), `provider_payout_id`, timestamps, `rejected_reason`, `admin_actor_id`, `external_txn_ref`. Indexes `(user_id, status)`, `(status, requested_at)`.
- Withdrawal request → pending debit in `referral_ledger`. On `paid` it stays; on `rejected`/`cancelled`/`failed` an offsetting `reversal` row preserves history.
- Withdrawable balance view: only accruals older than `withdrawal_hold_days` count.
- Monthly cap enforced at request via SUM over last 30d.

**Razorpay payouts:** Edge `wallet` adds `POST /admin/withdrawals/:id/payout` (admin-only) → Razorpay Payouts API → `processing` → webhook/poll for final status. `POST /wallet/webhook/razorpay-payouts`.

**Edge functions:** `referrals` adds `POST /me/referrals/withdraw`, `GET /me/referrals/withdrawals`. `admin` adds `GET /admin/withdrawals?status=`, `PATCH /admin/withdrawals/:id`.

**Frontend:** Withdrawal card on `/referrals` (full balance breakdown + request modal + monthly-cap remaining). `/administration/withdrawals` queue. New notification types: `withdrawal_requested`/`approved`/`paid`/`rejected`.

**Tests:** balance-math units; `scripts/test-withdrawal-flow.cjs`; concurrent-request race test.

**Definition of done:** ₹2,500 → request → admin approves → Razorpay completes → ledger reflects all states; cap enforced; concurrent requests can't double-spend.

---

## Stage 8 — Referrer Dashboards (Driver + Agent UI, unified)

**Goal:** spec §16/§17. Single `/referrals` page (mechanics are identical across personas) with role-aware copy. Visual contract: the prototype in trip-king-tour at `/driver/referrals` and `/agent/referrals`.

**Frontend:** `/referrals` route. Components in `src/components/referral/`:
- `ReferralCodeCard` — code, link, WhatsApp / "Invite Driver" / "Invite Agent" buttons.
- `ReferralSummaryCards` — totals.
- `EarningsSummaryCards` — lifetime / pending / released / transferred / withdrawn / withdrawable / today / this-week / this-month.
- `EarningsTimelineChart` — recharts daily bar chart, default last 30 days, range picker (7d / 30d / 90d / custom). Hover tooltip = date + count of trips + total earned.
- `TierProgress` — current + next-tier copy.
- `ReferredUserTable` — filters status/role; one row per referred user with name, role, signup date, KYC status, **eligible-paid-trips count**, **last trip date**, earned-so-far, cap, remaining, link status. Sortable. Click → drill-in.
- `ReferredUserDrilldown` — per-referred-user page: their trip-by-trip contribution to your earnings (date, route, fee source, your ₹50, running total, cap remaining).
- `EarningsLedger` — table from spec §16.6 (full chronological list with filters).
- `TransferAndWithdrawPanel` — two side-by-side cards from spec §16.7.

Notifications fanout (migration 049): extend `notifications.type` CHECK to add `referral_signup`/`verified`/`promo_exhausted`/`first_eligible_trip`/`qualified`/`earning`/`released`/`cap_reached`. Insert from Stage 4 + Stage 6 triggers.

**Edge function:** `GET /me/referrals?status=&role=` paginated; `GET /me/referrals/earnings?from=&to=`.

**Tests:** Vitest per component (loading/empty/error/axe); Playwright golden journey end-to-end (signup → verify → top-up → trips → accrue → transfer → withdraw).

**Definition of done:** dashboard matches the prototype; all notifications fire; Playwright golden passes against deployed backend.

---

## Stage 9 — Fraud Controls & Admin Operations

**Goal:** spec §19. Visual contract: prototype `/admin/referral-program` Fraud queue tab.

**DB (migration 050):**
- `referral_fraud_flags`: `id`, `referral_link_id` FK, `flag_type` (CHECK: 7 types), `severity`, `auto_detected` BOOL, `resolved_at`, `resolved_by`, `note`.
- Helper functions: duplicate Aadhaar across `drivers.aadhaar_number_hash`, duplicate UPI across `withdrawals.upi_id`, repeated agent-driver pair on completions. Device-fingerprint uses a stub `users.signup_fingerprint` column populated as future work.

**Edge functions:** `admin` adds `PATCH /admin/referrals/:id/status`, `POST /admin/referrals/:id/reverse-earnings`, `GET/PATCH /admin/referrals/flags`, `PATCH /admin/users/:id/risk`. Trigger on qualification runs duplicate checks → auto-flag at `severity=high` → `suspended` until reviewed.

**Frontend:** `/administration/referrals`, `/administration/referrals/flags`, dashboard widgets (liability, top referrers, signup→verified and verified→paid funnels — extend `get_admin_dashboard()`).

**Tests:** trigger tests; reversal preserves audit; suspended link blocks future accrual but preserves released earnings.

**Definition of done:** admin suspends mid-flight → released earnings preserved → future accrual stops → reversal reflected.

---

## Stage 10 — Promo Hook, Polish, Launch

- `wallet_settings.payment_source_priority` already lists `promo_credit` first — promo ledger lands later and slots in.
- T&C content (spec §21) shipped as static markdown on `/referrals`.
- FAQ shipped on `/referrals`.
- Onboarding-carousel slide announces the program.
- All new strings via `t()`.
- Index review on `referral_ledger`, `cash_wallet_ledger`, `platform_fee_charges`. Materialised view for referrer summaries if needed.
- a11y audit on all new screens.
- `/metrics` + `/sentry` review.
- Cross-link to the trip-king-tour explainer from `/referrals` and from app onboarding.

---

## Critical files

**Migrations (new):**
`042_referral_attribution.sql`, `043_cash_wallet.sql`, `044_platform_fee_charging.sql`, `045_referral_ledger_and_accrual.sql`, `046_referral_tiers_and_settings.sql`, `047_earnings_transfer.sql`, `048_withdrawals.sql`, `049_referral_notifications.sql`, `050_referral_fraud.sql`

**Edge functions (new):** `wallet`, `referrals`
**Edge functions (extend):** `auth`, `drivers`, `agents`, `trips`, `admin`, `notifications`

**Frontend (new):** `src/types/{referral,wallet}.ts`, `src/lib/api/services/{referrals,wallet,withdrawals}.ts`, `src/lib/api/transforms/{referral,wallet}.ts`, `src/hooks/{useReferral,useCashWallet,useWithdrawals}.ts`, `src/components/{referral,wallet}/*`, `src/pages/{Wallet,Referrals}.tsx`, `src/pages/administration/{ReferralsAdmin,WithdrawalsAdmin}.tsx`
**Frontend (extend):** [AdminConfigPage.tsx](../src/pages/administration/AdminConfigPage.tsx), `App.tsx` routes, `AppLayout` nav, `public/docs/openapi.yaml`+`.json`

**Smoke tests:** `scripts/test-{referral-attribution,wallet-topup,platform-fee,referral-accrual,admin-referral-config,earnings-transfer,withdrawal-flow,referral-fraud}.cjs`

---

## Reusable existing patterns

- [src/components/admin/LookupListEditor.tsx](../src/components/admin/LookupListEditor.tsx) — referral tiers.
- `AppSettingsForm` pattern — referral_settings + wallet_settings + fraud_settings.
- `admin_audit_log` + helper — every admin mutation.
- `kyc_status_change` notification trigger — pattern for new notification types.
- `withTiming` + `api_metrics` — automatic on new edge functions.
- `passengers.referred_by_user_id` (migration 019) — FK shape precedent for Stage 1.
- React Query `STALE` tier: wallet/referral summary = LIVE (30s); admin config = master (5min).

---

## Verification (each stage)

1. `node scripts/db.cjs --file supabase/migrations/0NN_*.sql` applies cleanly.
2. `npx supabase functions deploy <name>`.
3. `node scripts/test-<stage>.cjs` green.
4. `npm run typecheck && npm run test:run && npm run build` green (Husky enforces).
5. `/grant-admin <phone>` → admin login → exercise new admin surface.
6. `/metrics`, `/sentry` after a soak.
7. Stages 2 + 7 (Razorpay): test-mode end-to-end before any live keys.

---

## Out of scope (explicit hand-offs)

- **Real promo-credit ledger** — placeholder hook only.
- **Device-fingerprint capture pipeline** — Stage 9 reads from a stub column.
- **Razorpay merchant onboarding** — assumed complete.
- **TDS/tax handling on payouts** — may apply at scale (>₹15k/yr/user).
- **Mixed payment-source for a single fee** — Stages 3/6 lock to one source per fee.

---

## Risks

- **Razorpay integration** (Stages 2 + 7) — biggest unknown. Webhook signatures + idempotency on `provider_payment_id` non-negotiable. Test-mode end-to-end before live.
- **Trigger ordering** (Stages 3 + 4) — fee MUST charge first; accrual reads the resulting source. Idempotency via UNIQUE constraints.
- **Insufficient-balance UX** (Stage 3) — blocking trip completion is a hard product call. Document + revisit if friction is too high.
- **Anti-circular enforcement** (Stage 6) — sub-balance bleed order is the whole point; cover with a dedicated test.
- **Tier overlap & retroactivity** (Stage 5) — already-qualified links keep snapshot caps; new qualifications use new ranges. Per-tier `applies_retroactively` opt-in. Surface in admin UI.
- **Withdrawal race conditions** (Stage 7) — `SELECT … FOR UPDATE`; consider unique pending-withdrawal-per-user constraint.
- **Backfill** (Stage 4) — existing completed trips DON'T accrue retroactively (no fee was charged for them). Document: accrual starts the day Stage 3 ships.
