/**
 * Referral program — types shared across stages.
 *
 * Stage 1: every user has a `code`; Stage 4 fills in real per-link stats and
 * accrual numbers. The shape below mirrors the `referral` block returned on
 * `GET /drivers/me` and `GET /agents/me` (built by `buildReferralBlock` in the
 * drivers/agents edge functions).
 */

export interface ReferralSummary {
  totalReferred: number;
  verifiedReferrals: number;
  qualifiedReferrals: number;
  earningActive: number;
  capReached: number;
  lifetimeEarnedPaise: number;
  /** Stage 7 will fill this from the hold-period view; today it's always 0. */
  pendingPaise: number;
  /** Released = withdrawable today; Stage 7 splits hold vs released. */
  releasedPaise: number;
  withdrawablePaise: number;
}

/** The `referral` block on `/drivers/me` / `/agents/me`. */
export interface ReferralBlock {
  code: string;
  /** The user who referred *this* user (if any) — set once at signup, immutable. */
  referredByUserId?: string;
  summary: ReferralSummary;
}

// ── Dashboard endpoints (`/referrals/*` — Stage 4 backend) ───────────────────

export type ReferralLinkStatus =
  | 'signed_up'
  | 'verification_pending'
  | 'verified'
  | 'verification_rejected'
  | 'paid_trips_started'
  | 'qualified'
  | 'earning_active'
  | 'cap_reached'
  | 'suspended'
  | 'rejected'
  | 'expired';

export type ReferralLedgerEntryType = 'accrual' | 'reversal' | 'transfer_out' | 'withdrawal' | 'adjustment';

export interface ReferralLedgerEntry {
  id: string;
  referralLinkId?: string;
  entryType: ReferralLedgerEntryType;
  amountPaise: number;
  tripId?: string;
  platformFeeChargeId?: string;
  note?: string;
  createdAt: string;
}

/** `GET /referrals/me` summary block (per-status counts + accrual totals). */
export interface ReferralDashboardSummary {
  lifetimeEarnedPaise: number;
  reversedPaise: number;
  transferredPaise: number;
  withdrawnPaise: number;
  netPaise: number;
  withdrawablePaise: number;
  pendingPaise: number;
  counts: {
    totalReferred: number;
    earningActive: number;
    capReached: number;
    signedUp: number;
    verificationPending: number;
    verified: number;
    verificationRejected: number;
    paidTripsStarted: number;
    qualified: number;
    suspended: number;
    rejected: number;
    expired: number;
  };
}

export interface ReferralDashboard {
  userId: string;
  summary: ReferralDashboardSummary;
  recentLedger: ReferralLedgerEntry[];
}

/** `GET /referrals/me/referred` row — one referral link with the referred user joined. */
export interface ReferredUser {
  id: string;
  displayName?: string;
  phone?: string;
  role: 'driver' | 'trip_manager';
  referralCode?: string;
}

export interface ReferralLink {
  id: string;
  referrerUserId: string;
  referredUserId: string;
  referredUserRole: 'driver' | 'trip_manager';
  status: ReferralLinkStatus;
  capPaise: number;
  payoutPerTripPaise: number;
  qualifiedAt?: string;
  capReachedAt?: string;
  eligiblePaidTripsCount: number;
  totalEarnedPaise: number;
  createdAt: string;
  updatedAt: string;
  referredUser?: ReferredUser;
}

/** `GET /referrals/me/earnings` — per-day rollup of accruals. */
export interface ReferralEarningsBucket {
  date: string;
  trips: number;
  paise: number;
}

export interface ReferralEarningsSeries {
  from: string;
  to: string;
  days: ReferralEarningsBucket[];
}
