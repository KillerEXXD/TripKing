import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import {
  getAgent,
  getDriver,
  getDrivers,
  updateAgent,
  updateDriver,
  updateDriverLocation,
} from '@/lib/api/services/drivers';
import type { DriversQueryParams, UpdateDriverInput, UpdateLocationInput } from '@/types';

export function useDrivers(params?: DriversQueryParams) {
  return useQuery({ queryKey: ['drivers', params ?? {}], queryFn: () => getDrivers(params), staleTime: STALE.profile });
}
export function useDriver(id: string | undefined) {
  return useQuery({ queryKey: ['driver', id], queryFn: () => getDriver(id as string), enabled: !!id, staleTime: STALE.profile });
}
export function useAgent(id: string | undefined) {
  return useQuery({ queryKey: ['agent', id], queryFn: () => getAgent(id as string), enabled: !!id, staleTime: STALE.profile });
}

function useInvalidateDriver() {
  const qc = useQueryClient();
  return (id: string) => {
    void qc.invalidateQueries({ queryKey: ['driver', id] });
    void qc.invalidateQueries({ queryKey: ['drivers'] });
  };
}

export function useUpdateDriver() {
  const invalidate = useInvalidateDriver();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateDriverInput }) => updateDriver(id, input),
    onSuccess: (_d, v) => invalidate(v.id),
  });
}
export function useUpdateDriverLocation() {
  const invalidate = useInvalidateDriver();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateLocationInput }) => updateDriverLocation(id, input),
    onSuccess: (_d, v) => invalidate(v.id),
  });
}
export function useUpdateAgent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { fullName?: string; email?: string; businessName?: string; businessCityId?: string; profilePhotoUrl?: string } }) =>
      updateAgent(id, input),
    onSuccess: (_d, v) => void qc.invalidateQueries({ queryKey: ['agent', v.id] }),
  });
}
