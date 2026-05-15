import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import { getWallet, getWalletLedger, initiateTopup, verifyTopup } from '@/lib/api/services/wallet';
import type { TopupInitiateInput, TopupVerifyInput } from '@/types';

export function useCashWallet(enabled = true) {
  return useQuery({
    queryKey: ['wallet'],
    queryFn: getWallet,
    enabled,
    staleTime: STALE.profile,
  });
}

export function useCashWalletLedger(params?: { limit?: number; before?: string }, enabled = true) {
  return useQuery({
    queryKey: ['wallet', 'ledger', params ?? {}],
    queryFn: () => getWalletLedger(params),
    enabled,
    staleTime: STALE.profile,
  });
}

function useInvalidateWallet() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['wallet'] });
}

export function useInitiateTopup() {
  return useMutation({
    mutationFn: (input: TopupInitiateInput) => initiateTopup(input),
    meta: { toastOnError: true },
  });
}

export function useVerifyTopup() {
  const invalidate = useInvalidateWallet();
  return useMutation({
    mutationFn: (input: TopupVerifyInput) => verifyTopup(input),
    onSuccess: invalidate,
    meta: { toastOnError: true },
  });
}
