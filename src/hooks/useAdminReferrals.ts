import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import {
  createAdminFraudFlag,
  getAdminFraudFlags,
  getAdminReferrals,
  patchAdminReferralStatus,
  patchUserRisk,
  resolveAdminFraudFlag,
  reverseAdminReferralEarnings,
  type AdminFlagsListParams,
  type AdminReferralsListParams,
  type FraudFlagType,
  type FraudSeverity,
  type RiskLevel,
} from '@/lib/api/services/admin-referrals';
import type { ReferralLinkStatus } from '@/types';

export function useAdminReferrals(params?: AdminReferralsListParams) {
  return useQuery({
    queryKey: ['admin', 'referrals', params ?? {}],
    queryFn: () => getAdminReferrals(params),
    staleTime: STALE.profile,
  });
}

export function usePatchAdminReferralStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, note }: { id: string; status: ReferralLinkStatus; note?: string }) => patchAdminReferralStatus(id, status, note),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'referrals'] }),
    meta: { toastOnError: true },
  });
}

export function useReverseAdminReferralEarnings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => reverseAdminReferralEarnings(id, note),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'referrals'] }),
    meta: { toastOnError: true },
  });
}

export function useAdminFraudFlags(params?: AdminFlagsListParams) {
  return useQuery({
    queryKey: ['admin', 'referral-flags', params ?? {}],
    queryFn: () => getAdminFraudFlags(params),
    staleTime: STALE.profile,
  });
}

export function useCreateAdminFraudFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { referralLinkId: string; flagType: FraudFlagType; severity: FraudSeverity; note?: string }) => createAdminFraudFlag(input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'referral-flags'] }),
    meta: { toastOnError: true },
  });
}

export function useResolveAdminFraudFlag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, resolvedNote }: { id: string; resolvedNote?: string }) => resolveAdminFraudFlag(id, resolvedNote),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'referral-flags'] }),
    meta: { toastOnError: true },
  });
}

export function usePatchUserRisk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, risk, note }: { userId: string; risk: RiskLevel; note?: string }) => patchUserRisk(userId, risk, note),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin'] }),
    meta: { toastOnError: true },
  });
}
