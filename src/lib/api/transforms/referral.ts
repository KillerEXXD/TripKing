/**
 * Referral transforms — Stage 4 of the program. The `referral` block on
 * /drivers/me / /agents/me, plus the dashboard endpoints under /referrals/*.
 * Lenient on absence at the call-site (the block may not be present on every
 * payload), strict on shape: numeric fields must be numbers.
 */
import { ApiTransformError } from '@/lib/api/transforms/base';
import type {
  ReferralBlock,
  ReferralDashboard,
  ReferralDashboardSummary,
  ReferralEarningsBucket,
  ReferralEarningsSeries,
  ReferralLedgerEntry,
  ReferralLedgerEntryType,
  ReferralLink,
  ReferralLinkStatus,
  ReferralSummary,
  ReferredUser,
} from '@/types';

export type ReferralTransformErrorCode =
  | 'MISSING_CODE'
  | 'MISSING_LINK_ID'
  | 'MISSING_USER_ID'
  | 'BAD_NUMBER';
export class ReferralTransformError extends ApiTransformError<ReferralTransformErrorCode> {}

type Api = Record<string, unknown>;

function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return fallback;
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}
function reqStr(v: unknown, code: ReferralTransformErrorCode, ctx: Api): string {
  const s = str(v);
  if (!s) throw new ReferralTransformError(`missing ${code}`, code, ctx);
  return s;
}

const LINK_STATUSES: ReferralLinkStatus[] = ['signed_up', 'verification_pending', 'verified', 'verification_rejected', 'paid_trips_started', 'qualified', 'earning_active', 'cap_reached', 'suspended', 'rejected', 'expired'];
const ENTRY_TYPES: ReferralLedgerEntryType[] = ['accrual', 'reversal', 'transfer_out', 'withdrawal', 'adjustment'];

function linkStatus(v: unknown): ReferralLinkStatus {
  return typeof v === 'string' && (LINK_STATUSES as string[]).includes(v) ? (v as ReferralLinkStatus) : 'signed_up';
}
function entryType(v: unknown): ReferralLedgerEntryType {
  return typeof v === 'string' && (ENTRY_TYPES as string[]).includes(v) ? (v as ReferralLedgerEntryType) : 'adjustment';
}

/** Stage-4 summary inside the `referral` block on `/drivers|agents/me`. */
export function transformReferralSummary(v: unknown): ReferralSummary | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v !== 'object') return undefined;
  const o = v as Api;
  return {
    totalReferred: num(o.total_referred),
    verifiedReferrals: num(o.verified_referrals),
    qualifiedReferrals: num(o.qualified_referrals),
    earningActive: num(o.earning_active),
    capReached: num(o.cap_reached),
    lifetimeEarnedPaise: num(o.lifetime_earned_paise),
    pendingPaise: num(o.pending_paise),
    releasedPaise: num(o.released_paise),
    withdrawablePaise: num(o.withdrawable_paise),
  };
}

/** The `referral` block on `/drivers|agents/me`. Returns undefined if absent or no code. */
export function transformReferralBlock(v: unknown): ReferralBlock | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Api;
  const code = str(o.code);
  if (!code) return undefined;
  const summary = transformReferralSummary(o.summary) ?? {
    totalReferred: 0, verifiedReferrals: 0, qualifiedReferrals: 0, earningActive: 0, capReached: 0,
    lifetimeEarnedPaise: 0, pendingPaise: 0, releasedPaise: 0, withdrawablePaise: 0,
  };
  return { code, referredByUserId: str(o.referred_by_user_id), summary };
}

// ── /referrals/* dashboard transforms ────────────────────────────────────────

export function transformReferralLedgerEntry(api: Api): ReferralLedgerEntry {
  const id = reqStr(api.id, 'MISSING_LINK_ID', { api });
  return {
    id,
    referralLinkId: str(api.referral_link_id),
    entryType: entryType(api.entry_type),
    amountPaise: num(api.amount_paise),
    tripId: str(api.trip_id),
    platformFeeChargeId: str(api.platform_fee_charge_id),
    note: str(api.note),
    createdAt: str(api.created_at) ?? '',
  };
}

export function transformReferralDashboardSummary(v: unknown): ReferralDashboardSummary {
  const o = (v && typeof v === 'object' ? v : {}) as Api;
  const counts = (o.counts && typeof o.counts === 'object' ? o.counts : {}) as Api;
  return {
    lifetimeEarnedPaise: num(o.lifetime_earned_paise),
    reversedPaise: num(o.reversed_paise),
    transferredPaise: num(o.transferred_paise),
    withdrawnPaise: num(o.withdrawn_paise),
    netPaise: num(o.net_paise),
    withdrawablePaise: num(o.withdrawable_paise),
    pendingPaise: num(o.pending_paise),
    counts: {
      totalReferred: num(counts.total_referred),
      earningActive: num(counts.earning_active),
      capReached: num(counts.cap_reached),
      signedUp: num(counts.signed_up),
      verificationPending: num(counts.verification_pending),
      verified: num(counts.verified),
      verificationRejected: num(counts.verification_rejected),
      paidTripsStarted: num(counts.paid_trips_started),
      qualified: num(counts.qualified),
      suspended: num(counts.suspended),
      rejected: num(counts.rejected),
      expired: num(counts.expired),
    },
  };
}

export function transformReferralDashboard(api: Api): ReferralDashboard {
  return {
    userId: reqStr(api.user_id, 'MISSING_USER_ID', { api }),
    summary: transformReferralDashboardSummary(api.summary),
    recentLedger: Array.isArray(api.recent_ledger) ? (api.recent_ledger as Api[]).map(transformReferralLedgerEntry) : [],
  };
}

function transformReferredUser(v: unknown): ReferredUser | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Api;
  const id = str(o.id);
  if (!id) return undefined;
  const role = (str(o.role) === 'trip_manager' ? 'trip_manager' : 'driver') as 'driver' | 'trip_manager';
  return {
    id,
    role,
    displayName: str(o.display_name),
    phone: str(o.phone),
    referralCode: str(o.referral_code),
  };
}

export function transformReferralLink(api: Api): ReferralLink {
  const id = reqStr(api.id, 'MISSING_LINK_ID', { api });
  const referredRole = (str(api.referred_user_role) === 'trip_manager' ? 'trip_manager' : 'driver') as 'driver' | 'trip_manager';
  return {
    id,
    referrerUserId: reqStr(api.referrer_user_id, 'MISSING_USER_ID', { id }),
    referredUserId: reqStr(api.referred_user_id, 'MISSING_USER_ID', { id }),
    referredUserRole: referredRole,
    status: linkStatus(api.status),
    capPaise: num(api.cap_paise),
    payoutPerTripPaise: num(api.payout_per_trip_paise),
    qualifiedAt: str(api.qualified_at),
    capReachedAt: str(api.cap_reached_at),
    eligiblePaidTripsCount: num(api.eligible_paid_trips_count),
    totalEarnedPaise: num(api.total_earned_paise),
    createdAt: str(api.created_at) ?? '',
    updatedAt: str(api.updated_at) ?? '',
    referredUser: transformReferredUser(api.referred_user),
  };
}

function transformEarningsBucket(api: Api): ReferralEarningsBucket {
  return { date: str(api.date) ?? '', trips: num(api.trips), paise: num(api.paise) };
}

const WITHDRAWAL_STATUSES = ['requested', 'approved', 'processing', 'paid', 'rejected', 'cancelled', 'failed'] as const;

export function transformWithdrawal(api: Api): import('@/types').Withdrawal {
  const id = reqStr(api.id, 'MISSING_LINK_ID', { api });
  const status = (typeof api.status === 'string' && (WITHDRAWAL_STATUSES as readonly string[]).includes(api.status) ? api.status : 'requested') as import('@/types').WithdrawalStatus;
  const userJoin = api.user && typeof api.user === 'object' ? (api.user as Api) : null;
  return {
    id,
    userId: str(api.user_id),
    amountPaise: num(api.amount_paise),
    upiId: str(api.upi_id) ?? '',
    status,
    provider: str(api.provider),
    providerPayoutId: str(api.provider_payout_id),
    externalTxnRef: str(api.external_txn_ref),
    rejectedReason: str(api.rejected_reason),
    adminActorUserId: str(api.admin_actor_user_id),
    requestedAt: str(api.requested_at) ?? '',
    approvedAt: str(api.approved_at),
    paidAt: str(api.paid_at),
    failedAt: str(api.failed_at),
    user: userJoin
      ? {
          displayName: str(userJoin.display_name),
          phone: str(userJoin.phone),
          role: (typeof userJoin.role === 'string' ? userJoin.role : undefined) as 'driver' | 'trip_manager' | 'admin' | undefined,
        }
      : undefined,
  };
}

export function transformReferralEarnings(api: Api): ReferralEarningsSeries {
  return {
    from: str(api.from) ?? '',
    to: str(api.to) ?? '',
    days: Array.isArray(api.days) ? (api.days as Api[]).map(transformEarningsBucket) : [],
  };
}
