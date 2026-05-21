/**
 * Trips service — the trip lifecycle (post / browse / apply / assign / OTP-start /
 * complete / cancel). Thin functions over `apiClient`; transforms validate strictly.
 * (The matching `/trips/*` edge functions land in a later commit.)
 */
import { apiClient, EmptyResponseError } from '@/lib/api/client';
import { transformUploadUrl } from '@/lib/api/transforms/driver';
import { toApiPostTrip, transformMyApplication, transformTrip, transformTripAcceptance } from '@/lib/api/transforms/trip';
import type { ApplyToTripInput, MyApplication, PostTripInput, Trip, TripAcceptance, TripInvitation, TripInvitationStatus, TripMatchPreview, TripsQueryParams, UpdateTripDetailsInput, UpdateTripPassengerInput, UploadUrlResponse } from '@/types';

type Api = Record<string, unknown>;
function unwrap<T>(d: T | null): T {
  if (d === null || d === undefined) throw new EmptyResponseError('trips');
  return d;
}

export function getTrips(params?: TripsQueryParams): Promise<Trip[]> {
  const q: Record<string, unknown> = {};
  if (params?.status) q.status = Array.isArray(params.status) ? params.status.join(',') : params.status;
  if (params?.fromCityId) q.from_city_id = params.fromCityId;
  if (params?.toCityId) q.to_city_id = params.toCityId;
  if (params?.postedByUserId) q.posted_by_user_id = params.postedByUserId;
  if (params?.assignedDriverId) q.assigned_driver_id = params.assignedDriverId;
  if (params?.invited) q.invited = params.invited;
  if (params?.near) {
    q.near_lat = params.near.lat;
    q.near_lng = params.near.lng;
    q.radius_km = params.near.radiusKm;
  }
  if (params?.page) q.page = params.page;
  if (params?.limit) q.limit = params.limit;
  if (params?.offset != null && params.offset > 0) q.offset = params.offset;
  if (params?.sort) q.sort = params.sort;
  return apiClient.get<Api[]>('/trips', Object.keys(q).length ? q : undefined).then((r) => (r.data ?? []).map(transformTrip));
}

/** The caller's own trip applications (`GET /trips/applied`) — each a trip_acceptance with its joined (browse-safe) trip. Empty if the caller has no driver profile. */
export function getMyApplications(): Promise<MyApplication[]> {
  return apiClient.get<Api[]>('/trips/applied').then((r) => (r.data ?? []).map(transformMyApplication));
}

/** Paginated variant for `useInfiniteTrips`. Returns the page + a `hasMore` hint
 *  inferred from `items.length === limit`. */
export function getTripsPage(params: Omit<TripsQueryParams, 'offset' | 'limit'>, offset: number, limit: number): Promise<{ items: Trip[]; hasMore: boolean; nextOffset: number }> {
  return getTrips({ ...params, offset, limit }).then((items) => ({
    items,
    hasMore: items.length === limit,
    nextOffset: offset + items.length,
  }));
}

export function getTrip(id: string): Promise<Trip> {
  return apiClient.get<Api>(`/trips/${id}`).then((r) => transformTrip(unwrap(r.data)));
}

/**
 * `GET /trips/by-otp/:otp` — the public passenger portal. The OTP is the
 * credential (no auth header). The backend nulls the fare fields when
 * `show_fare_to_passenger` is false, so we coerce those to 0 before the strict
 * transform — the passenger UI reads `showFareToPassenger` to decide what to show.
 */
export function getTripByOtp(otp: string): Promise<Trip> {
  return apiClient.get<Api>(`/trips/by-otp/${encodeURIComponent(otp)}`).then((r) => {
    const row = unwrap(r.data);
    return transformTrip({ ...row, total_fare: row.total_fare ?? 0, rate_per_km: row.rate_per_km ?? 0, driver_payout: row.driver_payout ?? 0, driver_bata: row.driver_bata ?? 0 });
  });
}

export function getTripApplicants(tripId: string): Promise<TripAcceptance[]> {
  return apiClient.get<Api[]>(`/trips/${tripId}/applicants`).then((r) => (r.data ?? []).map(transformTripAcceptance));
}

export function postTrip(input: PostTripInput): Promise<Trip> {
  return apiClient.post<Api>('/trips', toApiPostTrip(input)).then((r) => transformTrip(unwrap(r.data)));
}

/** Counts-only preview for the trip-post form's auto-invite section. Returns 0/0/5 if the city is unset.
 *  `pickupAt` (+ optional `expectedEndAt`) is required for an accurate count — without it the server
 *  counts every active vacancy in the city regardless of when the driver is actually available. */
export function getTripMatchPreview(
  fromCityId: string,
  pickupAt?: string,
  expectedEndAt?: string,
  carTypeId?: string,
): Promise<TripMatchPreview> {
  const params: Record<string, string> = { from_city_id: fromCityId };
  if (pickupAt) params.pickup_at = pickupAt;
  if (expectedEndAt) params.expected_end_at = expectedEndAt;
  if (carTypeId) params.car_type_id = carTypeId;
  return apiClient.get<Api>('/trips/match-preview', params).then((r) => {
    const d = (r.data ?? {}) as Api;
    return {
      totalMatches: typeof d.total_matches === 'number' ? d.total_matches : 0,
      willInvite: typeof d.will_invite === 'number' ? d.will_invite : 0,
      maxInvites: typeof d.max_invites === 'number' ? d.max_invites : 5,
    };
  });
}

export function applyToTrip(tripId: string, input: ApplyToTripInput): Promise<TripAcceptance> {
  return apiClient
    .post<Api>(`/trips/${tripId}/applicants`, {
      vehicle_id: input.vehicleId,
      applicant_quoted_rate_per_km: input.quotedRatePerKm ?? null,
      applicant_message: input.message ?? null,
    })
    .then((r) => transformTripAcceptance(unwrap(r.data)));
}

export function withdrawApplication(tripId: string, acceptanceId: string): Promise<void> {
  return apiClient.delete<unknown>(`/trips/${tripId}/applicants/${acceptanceId}`).then(() => undefined);
}

export function rejectApplicant(tripId: string, acceptanceId: string, note?: string): Promise<TripAcceptance> {
  return apiClient
    .post<Api>(`/trips/${tripId}/applicants/${acceptanceId}/reject`, { decision_note: note ?? null })
    .then((r) => transformTripAcceptance(unwrap(r.data)));
}

export function assignDriver(tripId: string, acceptanceId: string): Promise<Trip> {
  return apiClient.post<Api>(`/trips/${tripId}/assign`, { acceptance_id: acceptanceId }).then((r) => transformTrip(unwrap(r.data)));
}

// Phase 2 of the two-step handshake (docs/TRIP_ASSIGNMENT_WORKFLOW.md §8).
// The selected driver Accepts → OTP is generated, trip flips to 'accepted'.
// Optional `withdrawAcceptanceIds` — applications on overlapping trips that
// should be withdrawn at the same time (driver's choice from AcceptTripDialog).
export function acceptTrip(tripId: string, input?: { withdrawAcceptanceIds?: string[] }): Promise<Trip> {
  const body = input?.withdrawAcceptanceIds?.length ? { withdraw_acceptance_ids: input.withdrawAcceptanceIds } : {};
  return apiClient.post<Api>(`/trips/${tripId}/accept`, body).then((r) => transformTrip(unwrap(r.data)));
}

/** Driver-only — fetches other trips the caller has applied to that overlap this one's
 *  [pickup_at, expected_end_at]. Used by the AcceptTripDialog. */
export function getOverlappingApplications(tripId: string): Promise<MyApplication[]> {
  return apiClient.get<Api[]>(`/trips/${tripId}/overlapping-applications`).then((r) => (r.data ?? []).map(transformMyApplication));
}

// Selected driver Declines → trip falls back to has_applicants (this driver is out of the pool).
export function declineTrip(tripId: string, reason?: string): Promise<Trip> {
  return apiClient.post<Api>(`/trips/${tripId}/decline`, reason ? { reason } : {}).then((r) => transformTrip(unwrap(r.data)));
}

// Trip creator withdraws the selection / assignment → trip falls back to has_applicants
// (the driver's acceptance row goes back to 'applied' — they're still in the pool).
export function cancelAssignment(tripId: string, reason?: string): Promise<Trip> {
  return apiClient.post<Api>(`/trips/${tripId}/cancel-assignment`, reason ? { reason } : {}).then((r) => transformTrip(unwrap(r.data)));
}

/** Signed PUT URL for the starting odometer photo into the private `trip-executions-photos` bucket. */
export function getStartOdoUploadUrl(tripId: string): Promise<UploadUrlResponse> {
  return apiClient
    .post<Api>(`/trips/${tripId}/start-odo-upload-url`, {})
    .then((r) => transformUploadUrl(unwrap(r.data)));
}
/** Signed PUT URL for the ending odometer photo. Trip must be in_progress. */
export function getEndOdoUploadUrl(tripId: string): Promise<UploadUrlResponse> {
  return apiClient
    .post<Api>(`/trips/${tripId}/end-odo-upload-url`, {})
    .then((r) => transformUploadUrl(unwrap(r.data)));
}

export function startTrip(tripId: string, input: { passengerOtp: string; startOdoUrl?: string; startOdoReading?: number }): Promise<Trip> {
  return apiClient
    .post<Api>(`/trips/${tripId}/start`, {
      passenger_otp: input.passengerOtp,
      start_odo_url: input.startOdoUrl ?? null,
      start_odo_reading: input.startOdoReading ?? null,
    })
    .then((r) => transformTrip(unwrap(r.data)));
}

export function completeTrip(tripId: string, input?: { endOdoUrl?: string; endOdoReading?: number; tollPaidByDriver?: number; driverNotes?: string; driverReviewNote?: string }): Promise<Trip> {
  return apiClient
    .post<Api>(`/trips/${tripId}/complete`, {
      end_odo_url: input?.endOdoUrl ?? null,
      end_odo_reading: input?.endOdoReading ?? null,
      toll_paid_by_driver: input?.tollPaidByDriver ?? 0,
      driver_notes: input?.driverNotes ?? null,
      driver_review_note: input?.driverReviewNote ?? null,
    })
    .then((r) => transformTrip(unwrap(r.data)));
}

export function cancelTrip(tripId: string, cancelReasonId: string): Promise<Trip> {
  return apiClient.post<Api>(`/trips/${tripId}/cancel`, { cancel_reason_id: cancelReasonId }).then((r) => transformTrip(unwrap(r.data)));
}

export function updateTripPassenger(tripId: string, input: UpdateTripPassengerInput): Promise<Trip> {
  const body: Record<string, unknown> = {};
  if (input.passengerName !== undefined) body.passenger_name = input.passengerName;
  if (input.passengerPhone !== undefined) body.passenger_phone = input.passengerPhone;
  if (input.passengerCount !== undefined) body.passenger_count = input.passengerCount;
  if (input.luggageNotes !== undefined) body.luggage_notes = input.luggageNotes;
  if (input.specialRequests !== undefined) body.special_requests = input.specialRequests;
  if (input.hidePassengerPhone !== undefined) body.hide_passenger_phone = input.hidePassengerPhone;
  return apiClient.patch<Api>(`/trips/${tripId}`, body).then((r) => transformTrip(unwrap(r.data)));
}

/**
 * Edit a trip's commercial / scheduling / vehicle fields. Server enforces
 * `status === 'open'` — once a driver has applied / been invited / been
 * selected, the trip is locked and the PATCH returns 409.
 */
export function updateTripDetails(tripId: string, input: UpdateTripDetailsInput): Promise<Trip> {
  const body: Record<string, unknown> = {};
  if (input.ratePerKm !== undefined) body.rate_per_km = input.ratePerKm;
  if (input.driverBata !== undefined) body.driver_bata = input.driverBata;
  if (input.commissionPct !== undefined) body.commission_pct = input.commissionPct;
  if (input.gstAmount !== undefined) body.gst_amount = input.gstAmount;
  if (input.pickupAt !== undefined) body.pickup_at = input.pickupAt;
  if (input.carTypeId !== undefined) body.car_type_id = input.carTypeId;
  if (input.acRequired !== undefined) body.ac_required = input.acRequired;
  if (input.seatsRequired !== undefined) body.seats_required = input.seatsRequired;
  if (input.driverInstructions !== undefined) body.driver_instructions = input.driverInstructions;
  if (input.extrasPaidByPassenger !== undefined) body.extras_paid_by_passenger = input.extrasPaidByPassenger;
  if (input.showFareToPassenger !== undefined) body.show_fare_to_passenger = input.showFareToPassenger;
  return apiClient.patch<Api>(`/trips/${tripId}`, body).then((r) => transformTrip(unwrap(r.data)));
}

// ─── Phase 4 trip_invitations — agent invites specific drivers ──────────────
function transformInvitation(api: Api): TripInvitation {
  const drv = api.driver as Api | undefined;
  const driver = drv
    ? {
        id: typeof drv.id === 'string' ? drv.id : '',
        userId: typeof drv.user_id === 'string' ? drv.user_id : '',
        displayHandle: typeof drv.display_handle === 'string' ? drv.display_handle : '',
        fullName: typeof drv.full_name === 'string' ? drv.full_name : undefined,
        profilePhotoUrl: typeof drv.profile_photo_url === 'string' ? drv.profile_photo_url : undefined,
        ratingAvg: typeof drv.rating_avg === 'number' ? drv.rating_avg : 0,
        ratingCount: typeof drv.rating_count === 'number' ? drv.rating_count : 0,
        totalTripsCompleted: typeof drv.total_trips_completed === 'number' ? drv.total_trips_completed : 0,
        topTags: [],
        kycStatus: typeof drv.kyc_status === 'string' ? (drv.kyc_status as 'pending' | 'docs_submitted' | 'video_pending' | 'approved' | 'rejected' | 'resubmit_required') : undefined,
      }
    : undefined;
  return {
    id: String(api.id),
    tripId: typeof api.trip_id === 'string' ? api.trip_id : undefined,
    driverId: typeof api.driver_id === 'string' ? api.driver_id : '',
    status: (typeof api.status === 'string' ? api.status : 'pending') as TripInvitationStatus,
    declinedReason: typeof api.declined_reason === 'string' ? api.declined_reason : undefined,
    createdAt: typeof api.created_at === 'string' ? api.created_at : '',
    updatedAt: typeof api.updated_at === 'string' ? api.updated_at : '',
    driver,
  };
}

export function inviteDrivers(tripId: string, driverIds: string[]): Promise<{ created: TripInvitation[]; skipped: string[] }> {
  return apiClient.post<Api>(`/trips/${tripId}/invites`, { driver_ids: driverIds }).then((r) => {
    const d = unwrap(r.data) as { created?: Api[]; skipped?: string[] };
    return {
      created: (d.created ?? []).map(transformInvitation),
      skipped: d.skipped ?? [],
    };
  });
}

export function getTripInvites(tripId: string): Promise<TripInvitation[]> {
  return apiClient.get<Api[]>(`/trips/${tripId}/invites`).then((r) => (r.data ?? []).map(transformInvitation));
}

export function withdrawTripInvite(tripId: string, inviteId: string): Promise<void> {
  return apiClient.delete<unknown>(`/trips/${tripId}/invites/${inviteId}`).then(() => undefined);
}

export function declineTripInvite(tripId: string, inviteId: string, reason?: string): Promise<void> {
  return apiClient.post<unknown>(`/trips/${tripId}/invites/${inviteId}/decline`, reason ? { reason } : {}).then(() => undefined);
}
