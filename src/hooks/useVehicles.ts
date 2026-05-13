import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import { addVehicle, deleteVehicle, getAdminVehicles, getAdminVehiclesPage, getDriverVehicles, getVehicle, setVehicleActive, updateVehicle, type AdminVehiclesQueryParams } from '@/lib/api/services/vehicles';
import type { VehicleInput } from '@/types';

export function useDriverVehicles(driverId: string | undefined) {
  return useQuery({ queryKey: ['vehicles', 'by-driver', driverId], queryFn: () => getDriverVehicles(driverId as string), enabled: !!driverId, staleTime: STALE.profile });
}
export function useVehicle(id: string | undefined) {
  return useQuery({ queryKey: ['vehicle', id], queryFn: () => getVehicle(id as string), enabled: !!id, staleTime: STALE.profile });
}
/** Admin eligibility dashboard — vehicles across all drivers. */
export function useAdminVehicles(params?: AdminVehiclesQueryParams) {
  return useQuery({ queryKey: ['vehicles', 'admin', params ?? {}], queryFn: () => getAdminVehicles(params), staleTime: STALE.profile });
}
/** Paginated `GET /vehicles` for the admin eligibility dashboard with infinite scroll. */
export function useInfiniteAdminVehicles(params?: Omit<AdminVehiclesQueryParams, 'page'>, limit = 50) {
  return useInfiniteQuery({
    queryKey: ['vehicles', 'admin', 'infinite', { ...(params ?? {}), limit }],
    queryFn: ({ pageParam }) => getAdminVehiclesPage({ ...(params ?? {}), page: pageParam as number, limit }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.hasMore ? last.meta.page + 1 : undefined),
    staleTime: STALE.profile,
  });
}

function useInvalidateVehicles() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries({ queryKey: ['vehicles'] });
}
export function useAddVehicle() {
  const invalidate = useInvalidateVehicles();
  return useMutation({ mutationFn: (input: VehicleInput) => addVehicle(input), onSuccess: invalidate });
}
export function useUpdateVehicle() {
  const invalidate = useInvalidateVehicles();
  return useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<VehicleInput> }) => updateVehicle(id, patch), onSuccess: invalidate });
}
export function useSetVehicleActive() {
  const invalidate = useInvalidateVehicles();
  return useMutation({ mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => setVehicleActive(id, isActive), onSuccess: invalidate });
}
export function useDeleteVehicle() {
  const invalidate = useInvalidateVehicles();
  return useMutation({ mutationFn: (id: string) => deleteVehicle(id), onSuccess: invalidate });
}
