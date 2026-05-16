import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import {
  createAdminRow,
  deleteAdminRow,
  getAppWallet,
  getSingletonSettings,
  listAdminRows,
  updateAdminRow,
  updateSingletonSettings,
  type AdminListKey,
  type SingletonKey,
} from '@/lib/api/services/admin-stage5';

type Row = Record<string, unknown>;

// ── Singleton settings ──────────────────────────────────────────────────────
export function useSingletonSettings(key: SingletonKey) {
  return useQuery({ queryKey: ['admin', key], queryFn: () => getSingletonSettings(key), staleTime: STALE.master });
}
export function useUpdateSingletonSettings(key: SingletonKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Row) => updateSingletonSettings(key, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', key] }),
    meta: { toastOnError: true },
  });
}

// ── List resources (untyped — generic editor) ────────────────────────────────
export function useAdminList(key: AdminListKey, opts?: { includeInactive?: boolean }) {
  return useQuery({ queryKey: ['admin', key, opts ?? {}], queryFn: () => listAdminRows(key, opts), staleTime: STALE.master });
}
export function useCreateAdminRow(key: AdminListKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Row) => createAdminRow(key, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', key] }),
    meta: { toastOnError: true },
  });
}
export function useUpdateAdminRow(key: AdminListKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Row }) => updateAdminRow(key, id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', key] }),
    meta: { toastOnError: true },
  });
}
export function useDeleteAdminRow(key: AdminListKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAdminRow(key, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', key] }),
    meta: { toastOnError: true },
  });
}

// ── App wallet ──────────────────────────────────────────────────────────────
export function useAppWallet(limit?: number) {
  return useQuery({ queryKey: ['admin', 'app-wallet', limit ?? 100], queryFn: () => getAppWallet(limit), staleTime: STALE.profile });
}
