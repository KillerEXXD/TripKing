/**
 * Trips service — the trip lifecycle (post / browse / apply / assign / OTP-start /
 * complete / cancel). Thin functions over `apiClient`; transforms validate strictly.
 * (The matching `/trips/*` edge functions land in a later commit.)
 */
import { apiClient, EmptyResponseError } from '@/lib/api/client';
import { toApiPostTrip, transformMyApplication, transformTrip, transformTripAcceptance } from '@/lib/api/transforms/trip';
import type { ApplyToTripInput, MyApplication, PostTripInput, Trip, TripAcceptance, TripsQueryParams, UpdateTripPassengerInput } from '@/types';

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
  if (params?.near) {
    q.near_lat = params.near.lat;
    q.near_lng = params.near.lng;
    q.radius_km = params.near.radiusKm;
  }
  if (params?.page) q.page = params.page;
  if (params?.limit) q.limit = params.limit;
  if (params?.sort) q.sort = params.sort;
  return apiClient.get<Api[]>('/trips', Object.keys(q).length ? q : undefined).then((r) => (r.data ?? []).map(transformTrip));
}

/** The caller's own trip applications (`GET /trips/applied`) — each a trip_acceptance with its joined (browse-safe) trip. Empty if the caller has no driver profile. */
export function getMyApplications(): Promise<MyApplication[]> {
  return apiClient.get<Api[]>('/trips/applied').then((r) => (r.data ?? []).map(transformMyApplication));
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

export function startTrip(tripId: string, input: { passengerOtp: string; startOdoUrl?: string; startOdoReading?: number }): Promise<Trip> {
  return apiClient
    .post<Api>(`/trips/${tripId}/start`, {
      passenger_otp: input.passengerOtp,
      start_odo_url: input.startOdoUrl ?? null,
      start_odo_reading: input.startOdoReading ?? null,
    })
    .then((r) => transformTrip(unwrap(r.data)));
}

export function completeTrip(tripId: string, input?: { endOdoUrl?: string; endOdoReading?: number; driverNotes?: string }): Promise<Trip> {
  return apiClient
    .post<Api>(`/trips/${tripId}/complete`, {
      end_odo_url: input?.endOdoUrl ?? null,
      end_odo_reading: input?.endOdoReading ?? null,
      driver_notes: input?.driverNotes ?? null,
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
