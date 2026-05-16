import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import { getMyAgent, getMyDriver } from '@/lib/api/services/drivers';
import {
  getAdminWithdrawals,
  getMyReferralDashboard,
  getMyReferralEarnings,
  getMyReferred,
  getMyWithdrawals,
  patchAdminWithdrawal,
  requestReferralWithdrawal,
  transferReferralToCashWallet,
  type AdminWithdrawalPatch,
} from '@/lib/api/services/referrals';
import { buildReferralLink, buildReferralShareMessage, buildWhatsAppShareUrl } from '@/lib/referral';
import type { Agent, Driver, ReferralSummary, WithdrawalStatus } from '@/types';

export type ReferralRole = 'driver' | 'agent';

export interface ReferralView {
  code: string;
  link: string;
  shareMessage: string;
  whatsappUrl: string;
  summary?: ReferralSummary;
}

/**
 * Stage 1+ referral hook — reads `referralCode` + `referralSummary` off the
 * existing `/drivers/me` or `/agents/me` payloads (no new endpoint). Returns
 * `data: undefined` until the backend Stage 1 PR is deployed.
 */
export function useReferral(role: ReferralRole | undefined) {
  return useQuery<Driver | Agent, Error, ReferralView | undefined>({
    queryKey: [role === 'agent' ? 'agent' : 'driver', 'me'],
    queryFn: () => (role === 'agent' ? getMyAgent() : getMyDriver()),
    enabled: role === 'driver' || role === 'agent',
    staleTime: STALE.profile,
    retry: false,
    select: (me) => {
      const code = me.referralCode;
      if (!code) return undefined;
      const link = buildReferralLink(code);
      const shareMessage = buildReferralShareMessage(code);
      return { code, link, shareMessage, whatsappUrl: buildWhatsAppShareUrl(shareMessage), summary: me.referralSummary };
    },
  });
}

// ── Stage 4 dashboard hooks ──────────────────────────────────────────────────

export function useReferralDashboard(enabled = true) {
  return useQuery({
    queryKey: ['referrals', 'me'],
    queryFn: getMyReferralDashboard,
    enabled,
    staleTime: STALE.profile,
  });
}

export function useReferred(params?: { status?: string; role?: 'driver' | 'trip_manager' }) {
  return useQuery({
    queryKey: ['referrals', 'me', 'referred', params ?? {}],
    queryFn: () => getMyReferred(params),
    staleTime: STALE.profile,
  });
}

export function useReferralEarnings(params?: { from?: string; to?: string }) {
  return useQuery({
    queryKey: ['referrals', 'me', 'earnings', params ?? {}],
    queryFn: () => getMyReferralEarnings(params),
    staleTime: STALE.profile,
  });
}

/** Stage 6 — transfer released referral earnings into the cash wallet. */
export function useTransferReferralToCashWallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (amountPaise: number) => transferReferralToCashWallet(amountPaise),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['referrals'] });
      void qc.invalidateQueries({ queryKey: ['wallet'] });
      void qc.invalidateQueries({ queryKey: ['driver', 'me'] });
      void qc.invalidateQueries({ queryKey: ['agent', 'me'] });
    },
    meta: { toastOnError: true },
  });
}

// ── Stage 7 — withdrawals ───────────────────────────────────────────────────

export function useMyWithdrawals(enabled = true) {
  return useQuery({
    queryKey: ['referrals', 'me', 'withdrawals'],
    queryFn: getMyWithdrawals,
    enabled,
    staleTime: STALE.profile,
  });
}

export function useRequestWithdrawal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ amountPaise, upiId }: { amountPaise: number; upiId: string }) => requestReferralWithdrawal(amountPaise, upiId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['referrals'] });
    },
    meta: { toastOnError: true },
  });
}

// ── Admin withdrawals queue ─────────────────────────────────────────────────

export function useAdminWithdrawals(params?: { status?: WithdrawalStatus; userId?: string; limit?: number }) {
  return useQuery({
    queryKey: ['admin', 'withdrawals', params ?? {}],
    queryFn: () => getAdminWithdrawals(params),
    staleTime: STALE.profile,
  });
}

export function usePatchAdminWithdrawal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: AdminWithdrawalPatch }) => patchAdminWithdrawal(id, patch),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'withdrawals'] });
    },
    meta: { toastOnError: true },
  });
}
