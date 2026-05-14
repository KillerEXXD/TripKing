import { useMutation, useQuery } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import { createInvalidator } from '@/lib/hooks/createInvalidator';
import { createAlert, deleteAlert, getAlert, getMyAlerts, setAlertActive, updateAlert } from '@/lib/api/services/alerts';
import type { AlertInput } from '@/types';

export function useMyAlerts() {
  return useQuery({ queryKey: ['alerts'], queryFn: getMyAlerts, staleTime: STALE.profile });
}
export function useAlert(id: string | undefined) {
  return useQuery({ queryKey: ['alert', id], queryFn: () => getAlert(id as string), enabled: !!id, staleTime: STALE.profile });
}

const useInvalidateAlerts = createInvalidator('alerts', 'alert');
export function useCreateAlert() {
  const invalidate = useInvalidateAlerts();
  return useMutation({ mutationFn: (input: AlertInput) => createAlert(input), onSuccess: () => invalidate() });
}
export function useUpdateAlert() {
  const invalidate = useInvalidateAlerts();
  return useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<AlertInput> }) => updateAlert(id, patch), onSuccess: (_d, v) => invalidate(v.id) });
}
export function useSetAlertActive() {
  const invalidate = useInvalidateAlerts();
  return useMutation({ mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => setAlertActive(id, isActive), onSuccess: (_d, v) => invalidate(v.id) });
}
export function useDeleteAlert() {
  const invalidate = useInvalidateAlerts();
  return useMutation({ mutationFn: (id: string) => deleteAlert(id), onSuccess: () => invalidate() });
}
