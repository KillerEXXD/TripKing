import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import {
  createMyAgentProfile,
  createMyDriverProfile,
  getAgent,
  getDriver,
  getDrivers,
  updateAgent,
  updateDriver,
  updateDriverLocation,
} from '@/lib/api/services/drivers';
import type { CreateAgentProfileInput, CreateDriverProfileInput, DriversQueryParams, UpdateDriverInput, UpdateLocationInput } from '@/types';

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

/** Create the signed-in user's driver profile (onboarding). */
export function useCreateMyDriverProfile() {
  const invalidate = useInvalidateDriver();
  return useMutation({
    mutationFn: (input: CreateDriverProfileInput) => createMyDriverProfile(input),
    onSuccess: (d) => invalidate(d.id),
  });
}
/** Create the signed-in user's agent (trip_manager) profile (onboarding). */
export function useCreateMyAgentProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAgentProfileInput) => createMyAgentProfile(input),
    onSuccess: (a) => void qc.invalidateQueries({ queryKey: ['agent', a.id] }),
  });
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
