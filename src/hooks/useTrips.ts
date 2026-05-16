import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import { createInvalidator } from '@/lib/hooks/createInvalidator';
import {
  acceptTrip,
  getOverlappingApplications,
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
  getTripMatchPreview,
  getTrips,
  inviteDrivers,
  postTrip,
  rejectApplicant,
  startTrip,
  updateTripDetails,
  updateTripPassenger,
  withdrawApplication,
  withdrawTripInvite,
} from '@/lib/api/services/trips';
import type { ApplyToTripInput, PostTripInput, TripInvitation, TripsQueryParams, TripStatus, UpdateTripDetailsInput, UpdateTripPassengerInput } from '@/types';

type StartInput = { passengerOtp: string; startOdoUrl?: string; startOdoReading?: number };
type CompleteInput = { endOdoUrl?: string; endOdoReading?: number; driverNotes?: string };

function staleForStatus(status?: TripStatus | TripStatus[]): number {
  const arr = Array.isArray(status) ? status : status ? [status] : [];
  return arr.length > 0 && arr.every((s) => s === 'completed' || s === 'cancelled') ? STALE.immutable : STALE.live;
}

/**
 * Per-status poll cadence. Tight during the two-step handshake so an agent
 * picking a driver sees the driver's Accept (or decline / cron-expiry) within
 * a few seconds; same in reverse for the driver waiting on the agent. Slower
 * for idle states; off entirely for terminal states. Returned as ms or false.
 */
function pollIntervalFor(status: TripStatus | undefined): number | false {
  switch (status) {
    case 'selected':       // critical window — handshake is live, both sides watching
      return 5_000;
    case 'in_progress':    // live tracking — driver position + ETA
      return 5_000;
    case 'has_applicants': // agent is hovering on the applicants page
    case 'accepted':       // assigned but not yet driving; passenger waiting for OTP
      return 15_000;
    case 'open':           // fresh post, agent watching for first applicant
      return 30_000;
    case 'completed':
    case 'cancelled':
    default:
      return false;
  }
}
/** True iff the data shape says "this query is actively polling" — drives the <LiveDot> indicator. */
export function isTripLive(status: TripStatus | undefined): boolean {
  return pollIntervalFor(status) !== false;
}

export function useTrips(params?: TripsQueryParams) {
  return useQuery({
    queryKey: ['trips', params ?? {}],
    queryFn: () => getTrips(params),
    placeholderData: keepPreviousData,
    staleTime: staleForStatus(params?.status),
    // Lists: poll while any row could still change. We pick the tightest interval that
    // matches the filter — selected/in_progress lists tick at 5s, others at 15s. If the
    // caller filtered to terminal states only (completed/cancelled), polling is off.
    refetchInterval: () => {
      const arr = Array.isArray(params?.status) ? params!.status : params?.status ? [params.status] : [];
      if (arr.length === 0) return 15_000; // mixed / no filter — agent's posted-trips list
      const intervals = arr.map((s) => pollIntervalFor(s as TripStatus)).filter((n): n is number => typeof n === 'number');
      if (intervals.length === 0) return false;
      return Math.min(...intervals);
    },
    refetchOnWindowFocus: true,
  });
}
export function useTrip(id: string | undefined) {
  return useQuery({
    queryKey: ['trip', id],
    queryFn: () => getTrip(id as string),
    enabled: !!id,
    staleTime: STALE.live,
    refetchInterval: (query) => pollIntervalFor(query.state.data?.status as TripStatus | undefined),
    refetchOnWindowFocus: true,
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
      return status === 'accepted' || status === 'in_progress' ? 12_000 : false;
    },
  });
}
export function useTripApplicants(tripId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['trip', tripId, 'applicants'],
    queryFn: () => getTripApplicants(tripId as string),
    enabled: enabled && !!tripId,
    staleTime: STALE.live,
    // Applicants list is the screen the agent picks from — poll so a new applicant
    // shows up within ~15s and a withdrawn one disappears just as fast.
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}
/** The caller's own trip applications (`GET /trips/applied`) — "my applications"; `[]` if they have no driver profile. */
export function useMyApplications() {
  return useQuery({
    queryKey: ['trips', 'applied'],
    queryFn: getMyApplications,
    staleTime: STALE.live,
    // Driver's "Applied" tab — needs to flip into 'selected' fast when the agent picks them.
    refetchInterval: 10_000,
    refetchOnWindowFocus: true,
  });
}

const useInvalidateTrips = createInvalidator('trips', 'trip');
const useInvalidateVacanciesFromTrips = createInvalidator('vacancies', 'vacancy');

/**
 * Counts-only auto-invite preview — drives the trip-post form's "N drivers available"
 * helper text and gates the Post button. Re-fires whenever the pickup city changes.
 * Short stale time so a driver coming online in the next minute is reflected.
 */
export function useTripMatchPreview(fromCityId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['trips', 'match-preview', fromCityId ?? null],
    queryFn: () => getTripMatchPreview(fromCityId as string),
    enabled: enabled && !!fromCityId,
    staleTime: 30_000,
    retry: 0,
  });
}

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
/** Phase 2 of the two-step handshake — the selected driver Accepts (OTP is generated, trip → accepted). */
export function useAcceptTrip() {
  const invalidate = useInvalidateTrips();
  return useMutation({
    mutationFn: ({ tripId, withdrawAcceptanceIds }: { tripId: string; withdrawAcceptanceIds?: string[] }) =>
      acceptTrip(tripId, { withdrawAcceptanceIds }),
    onSuccess: (_d, v) => invalidate(v.tripId),
  });
}

/** Driver-only — overlapping applications this driver should consider withdrawing
 *  when accepting `tripId`. Empty list means no conflict. Fetched on dialog open. */
export function useOverlappingApplications(tripId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['trip', tripId, 'overlapping-applications'],
    queryFn: () => getOverlappingApplications(tripId as string),
    enabled: !!tripId && enabled,
    staleTime: STALE.live,
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

export function useUpdateTripDetails() {
  const invalidate = useInvalidateTrips();
  return useMutation({
    mutationFn: ({ tripId, input }: { tripId: string; input: UpdateTripDetailsInput }) => updateTripDetails(tripId, input),
    onSuccess: (_d, v) => invalidate(v.tripId),
  });
}

// ─── Phase 4 trip_invitations hooks ─────────────────────────────────────────

export function useTripInvites(tripId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['trip', tripId, 'invites'],
    queryFn: () => getTripInvites(tripId as string),
    enabled: enabled && !!tripId,
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
  const invalidateVacancies = useInvalidateVacanciesFromTrips();
  return useMutation({
    mutationFn: ({ tripId, driverIds }: { tripId: string; driverIds: string[] }) => inviteDrivers(tripId, driverIds),
    onSuccess: (_d, v) => {
      invalidate(v.tripId);
      // Refresh /vacancies so the "N invites sent" badge + the dialog's "Already invited" rows
      // reflect the new invite without a manual page refresh.
      invalidateVacancies();
    },
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
