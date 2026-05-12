/**
 * Trip transforms — strict (throw on missing required fields; never compute
 * money/state). The API joins from_city / to_city / car_type server-side; for
 * acceptances it joins driver (+ its current_city) and vehicle.
 */
import { transformCity } from '@/lib/api/transforms/adminConfig';
import type {
  AcceptanceStatus,
  AssignedDriver,
  CityRow,
  DriverSummary,
  PosterRole,
  PostTripInput,
  Trip,
  TripAcceptance,
  TripStatus,
  VehicleSummary,
} from '@/types';

export type TripTransformErrorCode =
  | 'MISSING_ID'
  | 'MISSING_FROM_CITY'
  | 'MISSING_TO_CITY'
  | 'MISSING_PICKUP'
  | 'MISSING_FARE'
  | 'MISSING_PAYOUT'
  | 'MISSING_STATUS'
  | 'MISSING_CAR_TYPE'
  | 'MISSING_FIELD';

export class TripTransformError extends Error {
  constructor(message: string, public code: TripTransformErrorCode, public context: Record<string, unknown> = {}) {
    super(message);
    this.name = 'TripTransformError';
  }
}

type Api = Record<string, unknown>;
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}
function reqStr(v: unknown, code: TripTransformErrorCode, ctx: Api): string {
  const s = str(v);
  if (!s) throw new TripTransformError(`missing ${code}`, code, ctx);
  return s;
}
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : fallback;
}
function numOpt(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : undefined;
}
function reqNum(v: unknown, code: TripTransformErrorCode, ctx: Api): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) throw new TripTransformError(`missing ${code}`, code, ctx);
  return n;
}
function bool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}
function joinedCity(v: unknown, code: 'MISSING_FROM_CITY' | 'MISSING_TO_CITY', ctx: Api): CityRow {
  if (!v || typeof v !== 'object') throw new TripTransformError(`missing ${code}`, code, ctx);
  return transformCity(v as Api);
}

export function transformTrip(api: Api): Trip {
  const id = reqStr(api.id, 'MISSING_ID', { api });
  const ctx = { trip_id: id };
  const carType = api.car_type as Api | undefined;
  return {
    id,
    postedByUserId: reqStr(api.posted_by_user_id, 'MISSING_FIELD', ctx),
    postedByRole: ((api.posted_by_role as string) ?? 'trip_manager') as PosterRole,
    postedByName: str(api.posted_by_name) ?? '',
    postedByPhone: str(api.posted_by_phone),
    fromCity: joinedCity(api.from_city, 'MISSING_FROM_CITY', ctx),
    toCity: joinedCity(api.to_city, 'MISSING_TO_CITY', ctx),
    pickupAt: reqStr(api.pickup_at, 'MISSING_PICKUP', ctx),
    expectedDistanceKm: reqNum(api.expected_distance_km, 'MISSING_FIELD', ctx),
    carTypeId: reqStr(api.car_type_id, 'MISSING_CAR_TYPE', ctx),
    carTypeLabel: str(carType?.label),
    seatsRequired: num(api.seats_required, 4),
    acRequired: bool(api.ac_required, true),
    ratePerKm: reqNum(api.rate_per_km, 'MISSING_FIELD', ctx),
    totalFare: reqNum(api.total_fare, 'MISSING_FARE', ctx),
    commissionPct: num(api.commission_pct, 0),
    gstAmount: num(api.gst_amount, 0),
    driverBata: num(api.driver_bata, 0),
    extrasPaidByPassenger: bool(api.extras_paid_by_passenger, true),
    driverInstructions: str(api.driver_instructions),
    driverPayout: reqNum(api.driver_payout, 'MISSING_PAYOUT', ctx),
    passengerName: str(api.passenger_name) ?? '',
    passengerPhone: str(api.passenger_phone) ?? '',
    passengerCount: num(api.passenger_count, 1),
    luggageNotes: str(api.luggage_notes),
    specialRequests: str(api.special_requests),
    status: reqStr(api.status, 'MISSING_STATUS', ctx) as TripStatus,
    assignedDriverId: str(api.assigned_driver_id),
    assignedVehicleId: str(api.assigned_vehicle_id),
    assignedAcceptanceId: str(api.assigned_acceptance_id),
    assignedAt: str(api.assigned_at),
    assignedDriver: assignedDriverOf(api.assigned_driver),
    distanceToDestinationKm: numOpt(api.distance_to_destination_km),
    showFareToPassenger: bool(api.show_fare_to_passenger, true),
    hidePassengerPhone: bool(api.hide_passenger_phone, false),
    cancelledAt: str(api.cancelled_at),
    cancelReasonId: str(api.cancel_reason_id),
    applicantCount: num(api.applicant_count, 0),
    createdAt: reqStr(api.created_at, 'MISSING_FIELD', ctx),
    passengerOtp: str(api.passenger_otp),
  };
}

/** The `assigned_driver:drivers!...(...)` join on a trip row → an {@link AssignedDriver}, or `undefined` when no driver is assigned. */
function assignedDriverOf(v: unknown): AssignedDriver | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const a = v as Api;
  const id = str(a.id);
  if (!id) return undefined;
  return {
    id,
    fullName: str(a.full_name) ?? '',
    phone: str(a.phone),
    profilePhotoUrl: str(a.profile_photo_url) ?? '',
    ratingAvg: num(a.rating_avg, 0),
    ratingCount: num(a.rating_count, 0),
    totalTripsCompleted: num(a.total_trips_completed, 0),
    currentLat: numOpt(a.current_lat),
    currentLng: numOpt(a.current_lng),
    currentLocationAt: str(a.current_location_at),
  };
}

function transformDriverSummary(api: Api, ctx: Api): DriverSummary {
  return {
    id: reqStr(api.id, 'MISSING_FIELD', ctx),
    fullName: str(api.full_name) ?? '',
    profilePhotoUrl: str(api.profile_photo_url) ?? '',
    ratingAvg: num(api.rating_avg, 0),
    ratingCount: num(api.rating_count, 0),
    totalTripsCompleted: num(api.total_trips_completed, 0),
    topTags: Array.isArray(api.top_tags) ? (api.top_tags as string[]) : [],
    currentCity: api.current_city && typeof api.current_city === 'object' ? transformCity(api.current_city as Api) : undefined,
  };
}
function transformVehicleSummary(api: Api): VehicleSummary {
  return {
    id: str(api.id) ?? '',
    makeLabel: str((api.make as Api | undefined)?.name) ?? str(api.make_label),
    modelName: str((api.model as Api | undefined)?.name) ?? str(api.model_name),
    year: num(api.year, 0),
    carTypeLabel: str((api.car_type as Api | undefined)?.label) ?? str(api.car_type_label),
    seats: num(api.seats, 4),
    ac: bool(api.ac, true),
  };
}

export function transformTripAcceptance(api: Api): TripAcceptance {
  const id = reqStr(api.id, 'MISSING_ID', { api });
  const ctx = { acceptance_id: id };
  const driver = api.driver as Api | undefined;
  if (!driver || typeof driver !== 'object') throw new TripTransformError('acceptance has no driver', 'MISSING_FIELD', ctx);
  const vehicle = api.vehicle as Api | undefined;
  return {
    id,
    tripId: reqStr(api.trip_id, 'MISSING_FIELD', ctx),
    driverId: reqStr(api.driver_id, 'MISSING_FIELD', ctx),
    driver: transformDriverSummary(driver, ctx),
    vehicleId: str(api.vehicle_id),
    vehicle: vehicle && typeof vehicle === 'object' ? transformVehicleSummary(vehicle) : undefined,
    status: (str(api.status) ?? 'applied') as AcceptanceStatus,
    applicantMessage: str(api.applicant_message),
    applicantQuotedRatePerKm: typeof api.applicant_quoted_rate_per_km === 'number' ? (api.applicant_quoted_rate_per_km as number) : undefined,
    appliedAt: reqStr(api.applied_at, 'MISSING_FIELD', ctx),
    decisionAt: str(api.decision_at),
    decisionNote: str(api.decision_note),
  };
}

// ── write-side ──────────────────────────────────────────────────────────────
export function toApiPostTrip(input: PostTripInput): Record<string, unknown> {
  return {
    from_city_id: input.fromCityId,
    to_city_id: input.toCityId,
    pickup_at: input.pickupAt,
    expected_distance_km: input.expectedDistanceKm,
    car_type_id: input.carTypeId,
    seats_required: input.seatsRequired,
    ac_required: input.acRequired,
    rate_per_km: input.ratePerKm,
    total_fare: input.totalFare,
    commission_pct: input.commissionPct,
    gst_amount: input.gstAmount,
    driver_bata: input.driverBata,
    extras_paid_by_passenger: input.extrasPaidByPassenger,
    driver_instructions: input.driverInstructions ?? null,
    passenger_name: input.passengerName,
    passenger_phone: input.passengerPhone,
    passenger_count: input.passengerCount,
    luggage_notes: input.luggageNotes ?? null,
    special_requests: input.specialRequests ?? null,
    show_fare_to_passenger: input.showFareToPassenger,
    hide_passenger_phone: input.hidePassengerPhone,
  };
}
