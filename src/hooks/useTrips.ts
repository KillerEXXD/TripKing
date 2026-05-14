import { useMutation, useQuery } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import { createInvalidator } from '@/lib/hooks/createInvalidator';
import {
  acceptTrip,
  applyToTrip,
  assignDriver,
  cancelAssignment,
  cancelTrip,
  completeTrip,
  declineTrip,
  declineTripInvite,
  getMyApplications,
  getTrip,
  getTripApplicants,
  getTripByOtp,
  getTripInvites,
  getTrips,
  inviteDrivers,
  postTrip,
  rejectApplicant,
  startTrip,
  updateTripPassenger,
  withdrawApplication,
  withdrawTripInvite,
} from '@/lib/api/services/trips';
import type { ApplyToTripInput, PostTripInput, TripInvitation, TripsQueryParams, TripStatus, UpdateTripPassengerInput } from '@/types';

type StartInput = { passengerOtp: string; startOdoUrl?: string; startOdoReading?: number };
type CompleteInput = { endOdoUrl?: string; endOdoReading?: number; driverNotes?: string };

function staleForStatus(status?: TripStatus | TripStatus[]): number {
  const arr = Array.isArray(status) ? status : status ? [status] : [];
  return arr.length > 0 && arr.every((s) => s === 'completed' || s === 'cancelled') ? STALE.immutable : STALE.live;
}

export function useTrips(params?: TripsQueryParams) {
  return useQuery({ queryKey: ['trips', params ?? {}], queryFn: () => getTrips(params), staleTime: staleForStatus(params?.status) });
}
export function useTrip(id: string | undefined) {
  return useQuery({
    queryKey: ['trip', id],
    queryFn: () => getTrip(id as string),
    enabled: !!id,
    staleTime: STALE.live,
    // While the trip is running, poll so the live-tracking panel (driver position + ETA) stays current.
    refetchInterval: (query) => (query.state.data?.status === 'in_progress' ? 15_000 : false),
  });
}
/**
 * Public passenger-portal lookup — `GET /trips/by-otp/:otp` (the OTP is the
 * credential). Polls every 12 s while the trip is `assigned`/`in_progress` so the
 * passenger sees the driver's position + ETA update; stops once it's done/cancelled.
 */
export function useTripByOtp(otp: string | undefined) {
  return useQuery({
    queryKey: ['trip', 'by-otp', otp],
    queryFn: () => getTripByOtp(otp as string),
    enabled: !!otp,
    retry: false,
    staleTime: STALE.live,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'assigned' || status === 'in_progress' ? 12_000 : false;
    },
  });
}
export function useTripApplicants(tripId: string | undefined) {
  return useQuery({ queryKey: ['trip', tripId, 'applicants'], queryFn: () => getTripApplicants(tripId as string), enabled: !!tripId, staleTime: STALE.live });
}
/** The caller's own trip applications (`GET /trips/applied`) — "my applications"; `[]` if they have no driver profile. */
export function useMyApplications() {
  return useQuery({ queryKey: ['trips', 'applied'], queryFn: getMyApplications, staleTime: STALE.live });
}

const useInvalidateTrips = createInvalidator('trips', 'trip');

export function usePostTrip() {
  const invalidate = useInvalidateTrips();
  return useMutation({ mutationFn: (input: PostTripInput) => postTrip(input), onSuccess: () => invalidate() });
}
export function useApplyToTrip() {
  const invalidate = useInvalidateTrips();
  return useMutation({
    mutationFn: ({ tripId, input }: { tripId: string; input: ApplyToTripInput }) => applyToTrip(tripId, input),
    onSuccess: (_d, v) => invalidate(v.tripId),
  });
}
export function useWithdrawApplication() {
  const invalidate = useInvalidateTrips();
  return useMutation({
    mutationFn: ({ tripId, acceptanceId }: { tripId: string; acceptanceId: string }) => withdrawApplication(tripId, acceptanceId),
    onSuccess: (_d, v) => invalidate(v.tripId),
  });
}
export function useAssignDriver() {
  const invalidate = useInvalidateTrips();
  return useMutation({
    mutationFn: ({ tripId, acceptanceId }: { tripId: string; acceptanceId: string }) => assignDriver(tripId, acceptanceId),
    onSuccess: (_d, v) => invalidate(v.tripId),
  });
}
/** Phase 2 of the two-step handshake — the selected driver Accepts (OTP is generated, trip → assigned). */
export function useAcceptTrip() {
  const invalidate = useInvalidateTrips();
  return useMutation({
    mutationFn: ({ tripId }: { tripId: string }) => acceptTrip(tripId),
    onSuccess: (_d, v) => invalidate(v.tripId),
  });
}
/** Selected driver Declines — trip falls back to has_applicants; this driver is out of the pool. */
export function useDeclineTrip() {
  const invalidate = useInvalidateTrips();
  return useMutation({
    mutationFn: ({ tripId, reason }: { tripId: string; reason?: string }) => declineTrip(tripId, reason),
    onSuccess: (_d, v) => invalidate(v.tripId),
  });
}
/** Trip creator withdraws the selection/assignment — the driver's row goes back to 'applied'. */
export function useCancelAssignment() {
  const invalidate = useInvalidateTrips();
  return useMutation({
    mutationFn: ({ tripId, reason }: { tripId: string; reason?: string }) => cancelAssignment(tripId, reason),
    onSuccess: (_d, v) => invalidate(v.tripId),
  });
}
export function useRejectApplicant() {
  const invalidate = useInvalidateTrips();
  return useMutation({
    mutationFn: ({ tripId, acceptanceId, note }: { tripId: string; acceptanceId: string; note?: string }) => rejectApplicant(tripId, acceptanceId, note),
    onSuccess: (_d, v) => invalidate(v.tripId),
  });
}
export function useStartTrip() {
  const invalidate = useInvalidateTrips();
  return useMutation({
    mutationFn: ({ tripId, input }: { tripId: string; input: StartInput }) => startTrip(tripId, input),
    onSuccess: (_d, v) => invalidate(v.tripId),
  });
}
export function useCompleteTrip() {
  const invalidate = useInvalidateTrips();
  return useMutation({
    mutationFn: ({ tripId, input }: { tripId: string; input?: CompleteInput }) => completeTrip(tripId, input),
    onSuccess: (_d, v) => invalidate(v.tripId),
  });
}
export function useCancelTrip() {
  const invalidate = useInvalidateTrips();
  return useMutation({
    mutationFn: ({ tripId, cancelReasonId }: { tripId: string; cancelReasonId: string }) => cancelTrip(tripId, cancelReasonId),
    onSuccess: (_d, v) => invalidate(v.tripId),
  });
}
export function useUpdateTripPassenger() {
  const invalidate = useInvalidateTrips();
  return useMutation({
    mutationFn: ({ tripId, input }: { tripId: string; input: UpdateTripPassengerInput }) => updateTripPassenger(tripId, input),
    onSuccess: (_d, v) => invalidate(v.tripId),
  });
}

// ─── Phase 4 trip_invitations hooks ─────────────────────────────────────────

export function useTripInvites(tripId: string | undefined) {
  return useQuery({
    queryKey: ['trip', tripId, 'invites'],
    queryFn: () => getTripInvites(tripId as string),
    enabled: !!tripId,
    staleTime: STALE.live,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}

/** Driver's "Invited" tab — trips the caller has been invited to (pre-reveal exception applies). */
export function useInvitedTrips() {
  return useTrips({ invited: 'me' });
}

export function useInviteDrivers() {
  const invalidate = useInvalidateTrips();
  return useMutation({
    mutationFn: ({ tripId, driverIds }: { tripId: string; driverIds: string[] }) => inviteDrivers(tripId, driverIds),
    onSuccess: (_d, v) => invalidate(v.tripId),
  });
}

export function useWithdrawTripInvite() {
  const invalidate = useInvalidateTrips();
  return useMutation({
    mutationFn: ({ tripId, inviteId }: { tripId: string; inviteId: string }) => withdrawTripInvite(tripId, inviteId),
    onSuccess: (_d, v) => invalidate(v.tripId),
  });
}

export function useDeclineTripInvite() {
  const invalidate = useInvalidateTrips();
  return useMutation({
    mutationFn: ({ tripId, inviteId, reason }: { tripId: string; inviteId: string; reason?: string }) => declineTripInvite(tripId, inviteId, reason),
    onSuccess: (_d, v) => invalidate(v.tripId),
  });
}
// Re-export the invitation type so consumers can import from one place.
export type { TripInvitation };
