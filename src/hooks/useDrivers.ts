import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import { createInvalidator } from '@/lib/hooks/createInvalidator';
import {
  createMyAgentProfile,
  createMyDriverProfile,
  getAgent,
  getAgentKycDocs,
  getAgents,
  getDriver,
  getDriverKycDocs,
  getAgentsPage,
  getDrivers,
  getDriversPage,
  getMyAgent,
  getMyDriver,
  submitAgentKycDocs,
  submitDriverKycDocs,
  updateAgent,
  updateAgentKyc,
  updateDriver,
  updateDriverKyc,
  updateDriverLocation,
  type AgentsQueryParams,
} from '@/lib/api/services/drivers';
import type {
  CreateAgentProfileInput,
  CreateDriverProfileInput,
  DriversQueryParams,
  KycStatus,
  SubmitAgentKycDocsInput,
  SubmitDriverKycDocsInput,
  UpdateDriverInput,
  UpdateLocationInput,
} from '@/types';

export function useDrivers(params?: DriversQueryParams) {
  return useQuery({ queryKey: ['drivers', params ?? {}], queryFn: () => getDrivers(params), staleTime: STALE.profile });
}

/**
 * Paginated `GET /drivers` for infinite-scroll admin directories. Same filter
 * params as `useDrivers` minus `page` (the hook drives the pageParam itself).
 * `data.pages[i].data` is the rows for page i+1; `data.pages[i].meta.total`
 * is the unfiltered count for the header.
 */
export function useInfiniteDrivers(params?: Omit<DriversQueryParams, 'page'>, limit = 50) {
  return useInfiniteQuery({
    queryKey: ['drivers', 'infinite', { ...(params ?? {}), limit }],
    queryFn: ({ pageParam }) => getDriversPage({ ...(params ?? {}), page: pageParam as number, limit }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.hasMore ? last.meta.page + 1 : undefined),
    staleTime: STALE.profile,
  });
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
/** Paginated `GET /agents` for infinite-scroll admin directory — see `useInfiniteDrivers`. */
export function useInfiniteAgents(params?: Omit<AgentsQueryParams, 'page'>, limit = 50) {
  return useInfiniteQuery({
    queryKey: ['agents', 'infinite', { ...(params ?? {}), limit }],
    queryFn: ({ pageParam }) => getAgentsPage({ ...(params ?? {}), page: pageParam as number, limit }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.hasMore ? last.meta.page + 1 : undefined),
    staleTime: STALE.profile,
  });
}
/** The signed-in user's own driver profile (404 if they aren't a driver / haven't onboarded). */
export function useMyDriver(enabled = true) {
  return useQuery({ queryKey: ['driver', 'me'], queryFn: getMyDriver, enabled, staleTime: STALE.profile, retry: false });
}
/** The signed-in user's own agent profile (404 if they aren't an agent / haven't onboarded). */
export function useMyAgent(enabled = true) {
  return useQuery({ queryKey: ['agent', 'me'], queryFn: getMyAgent, enabled, staleTime: STALE.profile, retry: false });
}

const useInvalidateDriver = createInvalidator('drivers', 'driver');
const useInvalidateAgent = createInvalidator('agents', 'agent');

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
  const invalidate = useInvalidateAgent();
  return useMutation({
    mutationFn: (input: CreateAgentProfileInput) => createMyAgentProfile(input),
    onSuccess: (a) => invalidate(a.id),
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

// ── KYC documents ────────────────────────────────────────────────────────────
/** Masked numbers + 5-min signed download URLs for a driver's KYC docs (owner or admin). */
export function useDriverKycDocs(driverId: string | undefined, enabled = true) {
  return useQuery({ queryKey: ['driver', driverId, 'kyc-docs'], queryFn: () => getDriverKycDocs(driverId as string), enabled: enabled && !!driverId, staleTime: STALE.live });
}
export function useAgentKycDocs(agentId: string | undefined, enabled = true) {
  return useQuery({ queryKey: ['agent', agentId, 'kyc-docs'], queryFn: () => getAgentKycDocs(agentId as string), enabled: enabled && !!agentId, staleTime: STALE.live });
}
/** Submit a driver's KYC docs → kyc_status docs_submitted. */
export function useSubmitDriverKycDocs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ driverId, input }: { driverId: string; input: SubmitDriverKycDocsInput }) => submitDriverKycDocs(driverId, input),
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ['driver', 'me'] });
      void qc.invalidateQueries({ queryKey: ['driver', d.id] });
    },
  });
}
export function useSubmitAgentKycDocs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, input }: { agentId: string; input: SubmitAgentKycDocsInput }) => submitAgentKycDocs(agentId, input),
    onSuccess: (a) => {
      void qc.invalidateQueries({ queryKey: ['agent', 'me'] });
      void qc.invalidateQueries({ queryKey: ['agent', a.id] });
    },
  });
}
