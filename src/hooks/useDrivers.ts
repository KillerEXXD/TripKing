import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import {
  createMyAgentProfile,
  createMyDriverProfile,
  getAgent,
  getAgents,
  getDriver,
  getDrivers,
  getMyAgent,
  getMyDriver,
  updateAgent,
  updateAgentKyc,
  updateDriver,
  updateDriverKyc,
  updateDriverLocation,
  type AgentsQueryParams,
} from '@/lib/api/services/drivers';
import type { CreateAgentProfileInput, CreateDriverProfileInput, DriversQueryParams, KycStatus, UpdateDriverInput, UpdateLocationInput } from '@/types';

export function useDrivers(params?: DriversQueryParams) {
  return useQuery({ queryKey: ['drivers', params ?? {}], queryFn: () => getDrivers(params), staleTime: STALE.profile });
}
export function useDriver(id: string | undefined) {
  return useQuery({ queryKey: ['driver', id], queryFn: () => getDriver(id as string), enabled: !!id, staleTime: STALE.profile });
}
export function useAgent(id: string | undefined) {
  return useQuery({ queryKey: ['agent', id], queryFn: () => getAgent(id as string), enabled: !!id, staleTime: STALE.profile });
}
export function useAgents(params?: AgentsQueryParams) {
  return useQuery({ queryKey: ['agents', params ?? {}], queryFn: () => getAgents(params), staleTime: STALE.profile });
}
/** The signed-in user's own driver profile (404 if they aren't a driver / haven't onboarded). */
export function useMyDriver(enabled = true) {
  return useQuery({ queryKey: ['driver', 'me'], queryFn: getMyDriver, enabled, staleTime: STALE.profile, retry: false });
}
/** The signed-in user's own agent profile (404 if they aren't an agent / haven't onboarded). */
export function useMyAgent(enabled = true) {
  return useQuery({ queryKey: ['agent', 'me'], queryFn: getMyAgent, enabled, staleTime: STALE.profile, retry: false });
}

function useInvalidateDriver() {
  const qc = useQueryClient();
  return (id: string) => {
    void qc.invalidateQueries({ queryKey: ['driver', id] });
    void qc.invalidateQueries({ queryKey: ['drivers'] });
  };
}
function useInvalidateAgent() {
  const qc = useQueryClient();
  return (id: string) => {
    void qc.invalidateQueries({ queryKey: ['agent', id] });
    void qc.invalidateQueries({ queryKey: ['agents'] });
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
/** Best-effort geolocation ping for the assigned driver — failures are expected (flaky mobile network), so they aren't reported/toasted. */
export function useUpdateDriverLocation() {
  const invalidate = useInvalidateDriver();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateLocationInput }) => updateDriverLocation(id, input),
    onSuccess: (_d, v) => invalidate(v.id),
    meta: { silent: true },
  });
}
export function useUpdateAgent() {
  const invalidate = useInvalidateAgent();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: { fullName?: string; email?: string; businessName?: string; businessCityId?: string; profilePhotoUrl?: string } }) =>
      updateAgent(id, input),
    onSuccess: (_d, v) => invalidate(v.id),
  });
}
/** Admin KYC transition for a driver. */
export function useUpdateDriverKyc() {
  const invalidate = useInvalidateDriver();
  return useMutation({
    mutationFn: ({ id, kycStatus, note }: { id: string; kycStatus: KycStatus; note?: string }) => updateDriverKyc(id, kycStatus, note),
    onSuccess: (_d, v) => invalidate(v.id),
  });
}
/** Admin KYC transition for an agent. */
export function useUpdateAgentKyc() {
  const invalidate = useInvalidateAgent();
  return useMutation({
    mutationFn: ({ id, kycStatus, note }: { id: string; kycStatus: KycStatus; note?: string }) => updateAgentKyc(id, kycStatus, note),
    onSuccess: (_d, v) => invalidate(v.id),
  });
}
