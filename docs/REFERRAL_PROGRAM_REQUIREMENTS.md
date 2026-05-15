# Referral Program — Product Requirements

> **Status:** approved product spec, refined 2026-05-15.
> **Implementation plan:** [REFERRAL_IMPLEMENTATION_PLAN.md](./REFERRAL_IMPLEMENTATION_PLAN.md).
> **Live prototype:** trip-king-tour repo — `/refer` (12-screen explainer), `/driver/referrals`, `/agent/referrals`, `/admin/referral-program` (https://trip-king-tour.vercel.app/).

---

## 1. Objective

Build a referral bonus system for **Drivers** and **Agents** that rewards users for bringing real, verified, active marketplace participants.

TripKing already has a working Driver and Agent verification process. The referral system should use the existing verification status to decide referral eligibility.

Core principle:

> Users earn referral money only when their referred Driver or Agent is already verified, exhausts promotional credits, completes real paid trips, and pays platform fees using eligible real-money sources.

---

## 2. Supported Referral Types

The system should support all four referral flows:

| Referrer | Referred User | Supported |
| -------- | ------------: | --------: |
| Driver   |        Driver |       Yes |
| Driver   |         Agent |       Yes |
| Agent    |        Driver |       Yes |
| Agent    |         Agent |       Yes |

Each Driver and Agent should have:

* unique referral code,
* referral link,
* dashboard to track referrals,
* earnings tracking,
* withdrawal tracking,
* tier progress,
* status of every referred user.

---

## 3. Core Referral Rule

Referral rewards are **not paid for signup alone**.

Referral rewards are generated only when the referred user:

1. Signs up using a valid referral link or referral code.
2. Becomes **verified using the existing TripKing verification process**.
3. Uses up promotional credits.
4. Completes trips through TripKing.
5. Pays the platform fee using an eligible real-money source.
6. Trip is completed, confirmed, and not disputed.
7. Fraud checks are cleared.

---

## 4. Existing Verification Dependency

TripKing already has Driver and Agent verification implemented.

The referral system should only consume the existing verification status:

| Referred User Status  | Referral Eligibility                               |
| --------------------- | -------------------------------------------------- |
| Not verified          | Not eligible for referral earnings                 |
| Verification pending  | Not eligible for referral earnings                 |
| Verification rejected | Not eligible for referral earnings                 |
| Verified              | Eligible to continue toward referral qualification |

The referral module should not duplicate document collection, KYC review, or verification approval logic.

Use simple wording in the product:

> Referral earnings start only after your referred user is verified, finishes promotional credits, and starts completing eligible paid trips.

---

## 5. Referral Tiers

Referral payouts should be based on configurable tier slots.

### Default tier configuration

| Tier   | Qualified Referrals | Max Earning Per Referral | Payout Per Eligible Paid Trip |
| ------ | ------------------: | -----------------------: | ----------------------------: |
| Tier 1 |                1–10 |                   ₹2,500 |                           ₹50 |
| Tier 2 |               11–25 |                   ₹3,500 |                           ₹50 |
| Tier 3 |               26–50 |                   ₹5,000 |                           ₹50 |
| Tier 4 |                 51+ |             Configurable |                  Configurable |

### Product rule

The tier should be based on **qualified referrals**, not simple signups.

A referred user should count toward tier progress only after meeting all qualification rules.

### Tier application rule

The higher tier should apply based on the order in which referrals become qualified.

Example:

* Qualified referrals 1–10 get Tier 1 cap.
* Qualified referrals 11–25 get Tier 2 cap.
* Qualified referrals 26–50 get Tier 3 cap.

Do **not** retroactively upgrade older referrals when the referrer reaches a higher tier, unless admin explicitly enables that through configuration.

---

## 6. Qualified Referral Definition

A referred user becomes a **qualified referral** only after meeting these gates:

| Gate                                                 | Default Requirement |
| ---------------------------------------------------- | ------------------: |
| Signup completed using referral link/code            |                 Yes |
| Existing TripKing verification status = Verified     |                 Yes |
| Promotional credits exhausted                        |                 Yes |
| Minimum eligible paid completed trips                |           Default 5 |
| Fraud/dispute clearance                              |                 Yes |
| Manual admin review                                  |        Configurable |

A referred user should **not** become qualified merely because they signed up or became verified. They must also move into real paid activity.

---

## 7. Promotional Credits Rule

Promotional credits are used to encourage onboarding and first usage. However:

> Promotional credits must never generate withdrawable referral earnings.

If the referred user pays the ₹50 platform fee using promotional credits:

| Fee source          | Referral earning generated? |
| ------------------- | --------------------------: |
| Promotional credits |                          No |

Referral earnings begin only after the referred user has exhausted promotional credits and starts paying eligible real platform fees.

User-facing message:

> Referral earnings start only after your referred user is verified, finishes launch credits, and starts completing eligible paid trips.

---

## 8. Wallet Structure

The product should clearly separate wallet balances.

| Wallet Bucket              | Purpose                                |            Withdrawable? | Can Pay Platform Fee? | Can Trigger Referral Earning? |
| -------------------------- | -------------------------------------- | -----------------------: | --------------------: | ----------------------------: |
| Promotional Credits        | Signup/launch credits                  |                       No |                   Yes |                            No |
| Cash Wallet                | User top-up via UPI/card/net banking   | No, except refund policy |                   Yes |                           Yes |
| Referral Earnings Pending  | Earned but under hold/review           |                       No |                    No |                            No |
| Referral Earnings Released | Approved referral earnings             |                      Yes |   Yes, after transfer |                            No |
| Earnings Transfer Credit   | Released earnings moved to Trip Wallet |                       No |                   Yes |                            No |

---

## 9. Earnings Transfer to Trip Wallet

Users should be able to move released referral earnings into their Trip Wallet.

Add an option:

> **Transfer Earnings to Trip Wallet**

Suggested preset transfer amounts: ₹100 · ₹250 · ₹500 · ₹1,000 · custom.

Once transferred:

* amount moves from withdrawable referral earnings to Trip Wallet,
* it becomes usable for platform fees,
* it is no longer withdrawable,
* it is recorded as **Earnings Transfer Credit**,
* it does not generate referral rewards for any user when used.

Important rule:

> Platform fees paid using Earnings Transfer Credit must not trigger referral earnings.

This prevents circular earning loops.

---

## 10. Platform Fee Payment Source Rules

Every completed-trip platform fee should track the source of payment.

| Platform Fee Payment Source         | Referral Payout Generated? |
| ----------------------------------- | -------------------------: |
| Promotional Credits                 |                         No |
| Cash Wallet funded by real top-up   |                        Yes |
| Direct UPI/card payment             |                        Yes |
| Earnings Transfer Credit            |                         No |
| Referral Earnings Released directly |                         No |
| Admin bonus credit                  |                         No |
| Coupon/discount                     |                         No |
| Mixed payment                       |               Configurable |

Recommended launch rule:

> Referral earnings should be generated only when the full ₹50 platform fee is paid from Cash Wallet or direct real-money payment.

---

## 11. Payment Deduction Order

When the user pays a platform fee, the app should deduct from wallet balances in this order unless the user chooses otherwise:

1. Promotional Credits
2. Earnings Transfer Credit
3. Cash Wallet / real-money top-up

However, the app must separately track the source used.

Recommended launch rule for mixed payments:

> Only a full ₹50 real-money platform fee should trigger the ₹50 referral payout.

---

## 12. Referral Earning Calculation

Default rule:

> For each eligible paid completed trip by a referred user, the referrer earns ₹50 until the referral cap for that referred user is reached.

Formula:

```text
Referral earning = min(per-trip payout amount, remaining referral cap)
```

Examples:

| Tier   | Max Cap | ₹50 Eligible Trips Needed to Reach Cap |
| ------ | ------: | -------------------------------------: |
| Tier 1 |  ₹2,500 |                               50 trips |
| Tier 2 |  ₹3,500 |                               70 trips |
| Tier 3 |  ₹5,000 |                              100 trips |

---

## 13. What Counts as an Eligible Paid Completed Trip?

A trip should generate referral earnings only if all conditions are met:

1. The trip was created or assigned through TripKing.
2. The referred user participated in the trip as Driver or Agent.
3. The trip was completed.
4. The platform fee was charged.
5. The platform fee was paid using eligible real-money source.
6. Promotional credits were not used for the platform fee.
7. Earnings Transfer Credit was not used for the platform fee.
8. The trip was not cancelled.
9. The trip was not disputed.
10. The trip was not flagged as fake.
11. The fraud review period has passed.
12. The referred user's referral cap has not been reached.

---

## 14. Referral Earnings Statuses

Every earning should have a status.

| Status                     | Meaning                                             |
| -------------------------- | --------------------------------------------------- |
| Pending                    | Earning created but not yet withdrawable            |
| On Hold                    | Waiting for dispute/fraud review                    |
| Released                   | Available for withdrawal or transfer to Trip Wallet |
| Transferred to Trip Wallet | User moved earning into Trip Wallet                 |
| Withdrawn                  | Paid out to user                                    |
| Reversed                   | Removed due to fraud, dispute, or admin action      |
| Rejected                   | Not eligible                                        |

Recommended hold period: 3–7 days after trip completion.

---

## 15. Referred User Statuses

Each referred user should have clear status tracking in the referrer dashboard.

| Status                  | Meaning                                         |
| ----------------------- | ----------------------------------------------- |
| Signed Up               | User joined using referral                      |
| Profile Pending         | Basic profile incomplete, if applicable         |
| Verification Pending    | Existing verification process not completed yet |
| Verified                | Existing TripKing verification approved         |
| Verification Rejected   | Existing verification rejected                  |
| Promo Credits Active    | User still using launch credits                 |
| Promo Credits Exhausted | Promo credits finished                          |
| Paid Trips Started      | User has started real paid trips                |
| Qualification Pending   | User has not met all qualification gates        |
| Qualified               | User counts toward tier progress                |
| Earning Active          | Referral earning is being generated             |
| Cap Reached             | Maximum earning for this referral reached       |
| Suspended               | Referral paused due to review                   |
| Rejected                | Referral invalid                                |
| Expired                 | Did not qualify within configured time          |

---

## 16. Driver Dashboard Requirements

Drivers should have a complete Referral Program section.

### 16.1 Referral Home

Show: referral code, referral link, share on WhatsApp, share as Driver invite, share as Agent invite, current tier, next tier progress, total referral earnings.

### 16.2 Referral Summary

| Metric               | Description                                  |
| -------------------- | -------------------------------------------- |
| Total referred users | All signups using referral                   |
| Drivers referred     | Number of referred drivers                   |
| Agents referred      | Number of referred agents                    |
| Verified referrals   | Referred users with existing verified status |
| Qualified referrals  | Users counted toward tier                    |
| Earning active       | Users currently generating earnings          |
| Cap reached          | Referrals that completed max payout          |
| Rejected/suspended   | Invalid or blocked referrals                 |

### 16.3 Earnings Summary

Show: lifetime referral earnings, pending earnings, released earnings, transferred to Trip Wallet, withdrawn amount, withdrawable balance, today's earnings, this week's earnings, this month's earnings, this month's withdrawn amount, remaining monthly withdrawal limit.

### 16.4 Tier Progress

Example display:

> Current Tier: Tier 1
> Qualified Referrals: 7 / 10
> Next Tier: Tier 2
> Need 4 more qualified referrals to unlock up to ₹3,500 per future referral.

### 16.5 Referred User List

For each referred user, show: name, masked mobile, user type, signup date, verification status, promo credit status, paid completed trip count, eligible paid trip count, current referral status, tier applied, max earning cap, earned so far, remaining possible earning, last eligible trip date.

### 16.6 Earnings Ledger

| Date   | Referred User | Trip       | Fee Source   | Earning | Status       |
| ------ | ------------- | ---------- | ------------ | ------: | ------------ |
| 15 May | Kumar         | Trip #1023 | Cash Wallet  |     ₹50 | Pending      |
| 18 May | Kumar         | Trip #1029 | Cash Wallet  |     ₹50 | Released     |
| 20 May | Raj           | Trip #1044 | Promo Credit |      ₹0 | Not Eligible |

### 16.7 Transfer and Withdrawal Panel

Two options side-by-side:

- **Withdraw Earnings** — withdrawable balance, minimum withdrawal, monthly limit, amount withdrawn this month, request withdrawal button.
- **Transfer to Trip Wallet** — released earnings balance, transfer amount, transfer button, warning: *Transferred earnings can be used to pay platform fees but cannot be withdrawn later and will not generate further referral rewards.*

### 16.8 Daily Earnings Chart

Recharts daily bar chart, default last 30 days, range picker (7d / 30d / 90d / custom). Hover tooltip = date + count of trips + total earned.

---

## 17. Agent Dashboard Requirements

Agents should have the same full referral functionality with agent-specific framing — same components, same mechanics, agent-appropriate copy.

Agent-specific CTA cards:

### Refer Drivers
> Invite trusted drivers to TripKing. Earn when they complete eligible paid trips after verification and launch credits are exhausted.

### Refer Agents
> Invite travel agents and trip managers. Earn when they complete eligible paid trips through TripKing.

---

## 18. Admin Configuration Requirements

The referral system must be configurable from the admin panel.

### 18.1 Program Settings

Admin should configure: program name, program status, start date, end date, eligible referrer types, eligible referred user types, four pair flags (D→D, D→A, A→D, A→A), default hold period, default currency, manual approval requirement.

### 18.2 Tier Configuration

Per tier: tier name, referral count range, max payout per referral, payout per eligible trip, referred user type, referrer user type, active/inactive, retroactivity flag, campaign date range.

### 18.3 Qualification Gates

Verification status required, promo credits exhausted required, minimum eligible paid trips, minimum real-money platform fee generated, minimum active days, dispute-free period, manual admin approval, expiry time for referral qualification.

### 18.4 Wallet and Payment Source Rules

Per source: cash wallet ✓, direct UPI/card ✓, promotional credits ✗, earnings transfer credit ✗, admin bonus ✗, coupon ✗.

### 18.5 Withdrawal Configuration

Per role: minimum withdrawal, daily withdrawal limit, monthly withdrawal limit, payout method, hold period, admin approval required, fraud review required, new-user withdrawal delay, high-risk-user withdrawal restriction.

---

## 19. Fraud Prevention Product Rules

The referral program must include fraud protection but rely on existing verification for identity approval.

Referral payout should be blocked or held if: same verified identity appears suspiciously linked across accounts; same vehicle is used suspiciously across multiple users; same payment account is used across multiple users; same device is used for many accounts; referrer and referred user appear to be the same person; same agent-driver pair repeatedly completes suspicious trips; trip timing is unrealistic; trip is completed too quickly; trip lacks basic completion evidence; too many referrals from one suspicious cluster; user requests withdrawal immediately after suspicious activity.

Admin should be able to: hold earnings, release earnings, reverse earnings, suspend referral, reject referral, block withdrawal, approve withdrawal, mark user as high risk, remove user from referral program.

---

## 20. Notifications

### Referrer notifications

Notify when: someone signs up using referral code, referred user becomes verified, promo credits are exhausted, referred user completes first eligible paid trip, ₹50 earning is added, earning moves from pending to released, earning is transferred to Trip Wallet, earning is withdrawn, referral cap is reached, referral is suspended or rejected.

### Referred user notifications

Notify when: referral code is applied successfully, verification is required before referral eligibility, verification is approved, promo credits are active, promo credits are exhausted, paid trips now count for referral program.

### Admin notifications

Notify when: high referral payout is pending, high-value referrer crosses tier, withdrawal request is submitted, fraud flag is triggered, unusual referral activity is detected.

---

## 21. User-Facing Referral Terms

The app must clearly explain the rules.

1. Referral rewards are not paid for signup alone.
2. Referred user must become verified through TripKing's existing verification process.
3. Promotional credits must be exhausted before referral earnings begin.
4. Referral earnings are generated only from eligible real-money platform fees.
5. Platform fees paid using Promotional Credits do not generate referral rewards.
6. Platform fees paid using Earnings Transfer Credit do not generate referral rewards.
7. Referral earnings are paid ₹50 per eligible paid completed trip until cap is reached.
8. Referral cap depends on referrer's tier.
9. Earnings may be pending during the hold period.
10. Earnings may be reversed for fraud, dispute, or policy violation.
11. Promotional credits are not withdrawable.
12. Transferred earnings are not withdrawable after transfer to Trip Wallet.
13. Monthly withdrawal limits apply.
14. The platform may review, delay, or reject suspicious payouts.

---

## 22. Recommended User Copy

**Referral dashboard headline**
> **Earn by Referring Verified Drivers and Agents**

**Subheadline**
> Invite trusted drivers and agents to TripKing. Once they become verified, finish launch credits, and start completing eligible paid trips, you earn ₹50 per trip until your referral cap is reached.

**Transfer warning copy**
> Transferred earnings can be used to pay platform fees, but they cannot be withdrawn later and will not generate further referral rewards.

**Promo credit explanation**
> Trips paid using promotional credits do not generate referral earnings. Earnings start only after your referral starts paying eligible real-money platform fees.

**Tier explanation**
> Your tier is based on qualified referrals, not just signups. A referral becomes qualified only after verification and eligible paid trip activity.

---

## 23. Key Acceptance Criteria

### Referral tracking
- Driver and Agent can generate referral links.
- Referred users are linked to the correct referrer.
- Referral source cannot be changed without admin approval.
- Referral statuses update clearly.

### Qualification
- Signup alone does not qualify.
- Existing verified status is required.
- Promotional credits must be exhausted.
- Minimum eligible paid completed trips are required.
- Fraud/dispute checks must pass.

### Earnings
- Promotional credit payments do not generate referral earnings.
- Earnings Transfer Credit payments do not generate referral earnings.
- Cash Wallet/direct real-money payments can generate referral earnings.
- Referral earning must respect the tier cap.
- Earnings first go to pending.
- Earnings become released only after hold period.

### Wallet
- Promotional Credits are non-withdrawable.
- Released Referral Earnings are withdrawable.
- Released Referral Earnings can be transferred to Trip Wallet.
- Transferred earnings cannot be withdrawn again.
- Transferred earnings can pay platform fees.
- Transferred earnings do not generate more referral rewards.

### Dashboard
- Driver and Agent can see every referred user.
- Driver and Agent can see verification, promo credit, paid trip, qualification, earning, and cap status.
- Driver and Agent can see pending, released, transferred, withdrawn, and remaining earnings.
- Driver and Agent can see daily/weekly/monthly earnings.
- Driver and Agent can request withdrawal.
- Driver and Agent can transfer released earnings to Trip Wallet.

### Admin
- Admin can configure tiers, caps, payout amounts, gates, withdrawal limits, and payment source eligibility.
- Admin can hold, release, reverse, reject, suspend, or approve referral earnings.
- Admin can view referral liability and suspicious activity.

---

## 24. Final Refined Product Summary

TripKing already has a working verification system for Drivers and Agents. The referral module should use that existing verified status instead of building new verification logic.

The referral program rewards Drivers and Agents for bringing real, verified, active users. A referral does not generate earnings from signup, promotional credits, or transferred referral earnings. Earnings begin only when the referred user is verified, exhausts promotional credits, and pays eligible real-money platform fees on completed trips.

The referrer earns ₹50 per eligible paid completed trip until the tier-based cap is reached. Tier caps are configurable: ₹2,500 for the first 10 qualified referrals, ₹3,500 for referrals 11–25, ₹5,000 for referrals 26–50.

Users can either withdraw released referral earnings or transfer them to Trip Wallet to pay their own platform fees. Platform fees paid using transferred earnings do not create additional referral rewards (anti-circular rule).

This creates an aggressive but controlled referral engine that builds on the existing verification process and protects against free-credit abuse, circular payouts, fake trips, and low-quality signups.
