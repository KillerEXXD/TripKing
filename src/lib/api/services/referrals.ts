/** Referral dashboard service — Stage 4 of the referral program. */
import { apiClient, EmptyResponseError } from '@/lib/api/client';
import {
  transformReferralDashboard,
  transformReferralEarnings,
  transformReferralLink,
  transformWithdrawal,
} from '@/lib/api/transforms/referral';
import type { ReferralDashboard, ReferralEarningsSeries, ReferralLink, Withdrawal, WithdrawalStatus } from '@/types';

type Api = Record<string, unknown>;
function unwrap<T>(d: T | null): T {
  if (d === null || d === undefined) throw new EmptyResponseError('referrals');
  return d;
}

export function getMyReferralDashboard(): Promise<ReferralDashboard> {
  return apiClient.get<Api>('/referrals/me').then((r) => transformReferralDashboard(unwrap(r.data)));
}

export function getMyReferred(params?: { status?: string; role?: 'driver' | 'trip_manager' }): Promise<ReferralLink[]> {
  const q: Record<string, unknown> = {};
  if (params?.status) q.status = params.status;
  if (params?.role) q.role = params.role;
  return apiClient.get<Api[]>('/referrals/me/referred', Object.keys(q).length ? q : undefined).then((r) => (r.data ?? []).map(transformReferralLink));
}

export function getMyReferralEarnings(params?: { from?: string; to?: string }): Promise<ReferralEarningsSeries> {
  const q: Record<string, unknown> = {};
  if (params?.from) q.from = params.from;
  if (params?.to) q.to = params.to;
  return apiClient.get<Api>('/referrals/me/earnings', Object.keys(q).length ? q : undefined).then((r) => transformReferralEarnings(unwrap(r.data)));
}

export interface TransferReferralResult {
  /** New cash-wallet balances after the transfer (paise). */
  promoPaise: number;
  transferredPaise: number;
  cashPaise: number;
  totalPaise: number;
  /** New net referral balance after the transfer (paise). */
  netReferralPaise: number;
}

/** Stage 6 — moves released referral earnings into the cash wallet. */
export function transferReferralToCashWallet(amountPaise: number): Promise<TransferReferralResult> {
  return apiClient.post<Api>('/referrals/me/transfer-to-wallet', { amount_paise: amountPaise }).then((r) => {
    const row = unwrap(r.data);
    return {
      promoPaise: Number(row.promo_paise ?? 0),
      transferredPaise: Number(row.transferred_paise ?? 0),
      cashPaise: Number(row.cash_paise ?? 0),
      totalPaise: Number(row.total_paise ?? 0),
      netReferralPaise: Number(row.net_referral_paise ?? row.net_paise ?? 0),
    };
  });
}

// ── Stage 7 — withdrawals ───────────────────────────────────────────────────

export interface RequestWithdrawalResult {
  withdrawalId: string;
  amountPaise: number;
  status: WithdrawalStatus;
  withdrawableRemainingPaise: number;
}

export function requestReferralWithdrawal(amountPaise: number, upiId: string): Promise<RequestWithdrawalResult> {
  return apiClient.post<Api>('/referrals/me/withdraw', { amount_paise: amountPaise, upi_id: upiId }).then((r) => {
    const row = unwrap(r.data);
    return {
      withdrawalId: String(row.withdrawal_id ?? ''),
      amountPaise: Number(row.amount_paise ?? 0),
      status: (typeof row.status === 'string' ? row.status : 'requested') as WithdrawalStatus,
      withdrawableRemainingPaise: Number(row.withdrawable_remaining_paise ?? 0),
    };
  });
}

export function getMyWithdrawals(): Promise<Withdrawal[]> {
  return apiClient.get<Api[]>('/referrals/me/withdrawals').then((r) => (r.data ?? []).map(transformWithdrawal));
}

// ── Admin queue ─────────────────────────────────────────────────────────────

export function getAdminWithdrawals(params?: { status?: WithdrawalStatus; userId?: string; limit?: number }): Promise<Withdrawal[]> {
  const q: Record<string, unknown> = {};
  if (params?.status) q.status = params.status;
  if (params?.userId) q.user_id = params.userId;
  if (params?.limit) q.limit = params.limit;
  return apiClient.get<Api[]>('/admin/withdrawals', Object.keys(q).length ? q : undefined).then((r) => (r.data ?? []).map(transformWithdrawal));
}

export interface AdminWithdrawalPatch {
  outcome: 'approved' | 'processing' | 'paid' | 'rejected' | 'cancelled' | 'failed';
  providerPayoutId?: string;
  externalTxnRef?: string;
  rejectedReason?: string;
}

export function patchAdminWithdrawal(id: string, patch: AdminWithdrawalPatch): Promise<Withdrawal> {
  const body: Record<string, unknown> = { outcome: patch.outcome };
  if (patch.providerPayoutId) body.provider_payout_id = patch.providerPayoutId;
  if (patch.externalTxnRef) body.external_txn_ref = patch.externalTxnRef;
  if (patch.rejectedReason) body.rejected_reason = patch.rejectedReason;
  return apiClient.patch<Api>(`/admin/withdrawals/${id}`, body).then((r) => transformWithdrawal(unwrap(r.data)));
}
