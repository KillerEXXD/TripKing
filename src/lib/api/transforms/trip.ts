/**
 * Trip transforms — strict (throw on missing required fields; never compute
 * money/state). The API joins from_city / to_city / car_type server-side; for
 * acceptances it joins driver (+ its current_city) and vehicle.
 */
import { ApiTransformError } from '@/lib/api/transforms/base';
import { transformCity } from '@/lib/api/transforms/adminConfig';
import { maybePlace } from '@/lib/api/transforms/place';
import { transformVerification } from '@/lib/api/transforms/driver';
import type {
  AcceptanceStatus,
  AssignedDriver,
  CityRow,
  DriverSummary,
  KycStatus,
  MyApplication,
  PosterRole,
  PostTripInput,
  Trip,
  TripAcceptance,
  TripCategory,
  TripStatus,
  TripType,
  VehicleSummary,
  Waypoint,
} from '@/types';

const KYC_STATUSES: KycStatus[] = ['pending', 'docs_submitted', 'video_pending', 'ready_for_approval', 'approved', 'rejected', 'resubmit_required'];
function kycStatusOpt(v: unknown): KycStatus | undefined {
  return typeof v === 'string' && (KYC_STATUSES as string[]).includes(v) ? (v as KycStatus) : undefined;
}

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

export class TripTransformError extends ApiTransformError<TripTransformErrorCode> {}

type Api = Record<string, unknown>;
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}
function reqStr(v: unknown, code: TripTransformErrorCode, ctx: Api, field?: string): string {
  const s = str(v);
  if (!s) {
    // Prefer the concrete `field` arg, else fall back to ctx.field, else the
    // error code. Surfaces in Sentry as `missing posted_by_user_id` instead of
    // the useless `missing MISSING_FIELD` (Sentry #7488333585).
    const label = field ?? (typeof ctx?.field === 'string' ? ctx.field : code);
    throw new TripTransformError(`missing ${label}`, code, { ...ctx, field: label });
  }
  return s;
}
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : fallback;
}
function numOpt(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : undefined;
}
function reqNum(v: unknown, code: TripTransformErrorCode, ctx: Api, field?: string): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) {
    const label = field ?? (typeof ctx?.field === 'string' ? ctx.field : code);
    throw new TripTransformError(`missing ${label}`, code, { ...ctx, field: label });
  }
  return n;
}
function bool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}
function joinedCity(v: unknown, code: 'MISSING_FROM_CITY' | 'MISSING_TO_CITY', ctx: Api): CityRow {
  if (!v || typeof v !== 'object') throw new TripTransformError(`missing ${code}`, code, ctx);
  return transformCity(v as Api);
}

const TRIP_TYPES: TripType[] = ['one_way', 'round_trip', 'multi_way'];
function tripTypeOf(v: unknown): TripType {
  return typeof v === 'string' && (TRIP_TYPES as string[]).includes(v) ? (v as TripType) : 'one_way';
}
const TRIP_CATEGORIES: TripCategory[] = ['local', 'outstation', 'package'];
function tripCategoryOf(v: unknown): TripCategory {
  return typeof v === 'string' && (TRIP_CATEGORIES as string[]).includes(v) ? (v as TripCategory) : 'outstation';
}

/** Migration-024 waypoint join → camelCase `Waypoint`. Tolerant of missing fields (server invariants
 *  guarantee id + seq; everything else is optional per business rules). */
export function transformWaypoint(api: Api): Waypoint {
  const city = api.city && typeof api.city === 'object' ? transformCity(api.city as Api) : undefined;
  const place = maybePlace(api.place);
  return {
    id: str(api.id) ?? '',
    seq: num(api.seq, 0),
    city,
    place,
    arriveAt: str(api.arrive_at),
    waitMinutes: num(api.wait_minutes, 0),
    isDestination: bool(api.is_destination, false),
    notes: str(api.notes),
  };
}

export function transformTrip(api: Api): Trip {
  const id = reqStr(api.id, 'MISSING_ID', { api });
  const ctx = { trip_id: id };
  const carType = api.car_type as Api | undefined;
  return {
    id,
    tripType: tripTypeOf(api.trip_type),
    tripCategory: tripCategoryOf(api.trip_category),
    packageHours: num(api.package_hours, 0) || undefined,
    packageIncludedKm: num(api.package_included_km, 0) || undefined,
    expectedEndAt: str(api.expected_end_at),
    waypoints: Array.isArray(api.waypoints) ? (api.waypoints as Api[]).map(transformWaypoint).sort((a, b) => a.seq - b.seq) : [],
    postedByUserId: reqStr(api.posted_by_user_id, 'MISSING_FIELD', ctx, 'posted_by_user_id'),
    postedByRole: ((api.posted_by_role as string) ?? 'trip_manager') as PosterRole,
    postedByHandle: reqStr(api.posted_by_handle, 'MISSING_FIELD', ctx, 'posted_by_handle'),
    postedByName: str(api.posted_by_name),
    postedByPhone: str(api.posted_by_phone),
    // Optional — server includes it when known so cards can render the inline Verified badge.
    postedByKycStatus: typeof api.posted_by_kyc_status === 'string'
      ? (api.posted_by_kyc_status as Trip['postedByKycStatus'])
      : undefined,
    fromCity: joinedCity(api.from_city, 'MISSING_FROM_CITY', ctx),
    toCity: joinedCity(api.to_city, 'MISSING_TO_CITY', ctx),
    fromPlace: maybePlace(api.from_place),
    toPlace: maybePlace(api.to_place),
    pickupAt: reqStr(api.pickup_at, 'MISSING_PICKUP', ctx),
    expectedDistanceKm: reqNum(api.expected_distance_km, 'MISSING_FIELD', ctx, 'expected_distance_km'),
    carTypeId: reqStr(api.car_type_id, 'MISSING_CAR_TYPE', ctx),
    carTypeLabel: str(carType?.label),
    seatsRequired: num(api.seats_required, 4),
    acRequired: bool(api.ac_required, true),
    ratePerKm: reqNum(api.rate_per_km, 'MISSING_FIELD', ctx, 'rate_per_km'),
    totalFare: reqNum(api.total_fare, 'MISSING_FARE', ctx),
    commissionPct: num(api.commission_pct, 0),
    gstAmount: num(api.gst_amount, 0),
    driverBata: num(api.driver_bata, 0),
    extrasPaidByPassenger: bool(api.extras_paid_by_passenger, true),
    driverInstructions: str(api.driver_instructions),
    driverPayout: reqNum(api.driver_payout, 'MISSING_PAYOUT', ctx),
    // Optional final-settlement fields populated by migration 059 once the trip completes.
    // Pre-completion trips return null; passenger-bill items are nulled when
    // show_fare_to_passenger=false (server-side, in by-otp redactor).
    finalTotalFare: numOpt(api.final_total_fare),
    extraDistanceKm: numOpt(api.extra_distance_km),
    extraKmFare: numOpt(api.extra_km_fare),
    tollAmount: numOpt(api.toll_amount),
    finalDriverPayout: numOpt(api.final_driver_payout),
    // The trip_executions embed is `execution: { started_at, completed_at, … }` — flatten it
    // so consumers don't have to dig. Optional everywhere: null until the trip starts.
    startedAt: str((api.execution as Record<string, unknown> | null | undefined)?.started_at),
    completedAt: str((api.execution as Record<string, unknown> | null | undefined)?.completed_at),
    startOdoReading: numOpt((api.execution as Record<string, unknown> | null | undefined)?.start_odo_reading),
    endOdoReading: numOpt((api.execution as Record<string, unknown> | null | undefined)?.end_odo_reading),
    actualDistanceKm: numOpt((api.execution as Record<string, unknown> | null | undefined)?.actual_distance_km),
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
    assignedDriverHandle: str(api.assigned_driver_handle),
    assignedDriver: assignedDriverOf(api.assigned_driver),
    postedByVerification: transformVerification(api.posted_by_verification),
    distanceToDestinationKm: numOpt(api.distance_to_destination_km),
    showFareToPassenger: bool(api.show_fare_to_passenger, true),
    hidePassengerPhone: bool(api.hide_passenger_phone, false),
    cancelledAt: str(api.cancelled_at),
    cancelReasonId: str(api.cancel_reason_id),
    applicantCount: num(api.applicant_count, 0),
    pendingInvitationCount: num(api.pending_invitation_count, 0),
    autoInvitedCount: numOpt(api.auto_invited_count),
    invitationId: str(api.invitation_id),
    invitationStatus: typeof api.invitation_status === 'string'
      ? (api.invitation_status as Trip['invitationStatus'])
      : undefined,
    myApplicationId: str(api.my_application_id),
    myApplicationStatus: typeof api.my_application_status === 'string'
      ? (api.my_application_status as Trip['myApplicationStatus'])
      : undefined,
    createdAt: reqStr(api.created_at, 'MISSING_FIELD', ctx, 'created_at'),
    updatedAt: str(api.updated_at),
    passengerOtp: str(api.passenger_otp),
    distanceKm: numOpt(api.distance_km),
    // Phase 1 of the two-step handshake (migration 030). Default 15 so trips
    // that pre-date the column still satisfy the type — DB default is 15 too.
    acceptanceWindowMinutes: num(api.acceptance_window_minutes, 15),
    acceptanceDeadlineAt: str(api.acceptance_deadline_at),
    driverAcceptanceStatus: typeof api.driver_acceptance_status === 'string'
      ? (api.driver_acceptance_status as Trip['driverAcceptanceStatus'])
      : undefined,
    platformFeeBreakdown: platformFeeBreakdownOf(api.platform_fee_breakdown),
  };
}

function platformFeeChargeOf(v: unknown): { amountPaise: number; paymentSource: string; status: 'pending' | 'charged' | 'failed' | 'refunded' } | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Api;
  const status = typeof o.status === 'string' ? o.status : 'pending';
  return {
    amountPaise: num(o.amount_paise, 0),
    paymentSource: typeof o.payment_source === 'string' ? o.payment_source : '',
    status: (['pending', 'charged', 'failed', 'refunded'].includes(status) ? status : 'pending') as 'pending' | 'charged' | 'failed' | 'refunded',
  };
}
function platformFeeBreakdownOf(v: unknown): Trip['platformFeeBreakdown'] {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Api;
  const out: Trip['platformFeeBreakdown'] = {};
  const driver = platformFeeChargeOf(o.driver);
  const agent = platformFeeChargeOf(o.agent);
  if (driver) out.driver = driver;
  if (agent) out.agent = agent;
  return Object.keys(out).length === 0 ? undefined : out;
}

/**
 * The `assigned_driver:drivers!...(...)` join on a trip row → an {@link AssignedDriver}, or
 * `undefined` when no driver is assigned. `display_handle` is required; `full_name` / `phone` /
 * `profile_photo_url` may be stripped by the server for browse viewers — kept optional.
 */
function assignedDriverOf(v: unknown): AssignedDriver | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const a = v as Api;
  const id = str(a.id);
  if (!id) return undefined;
  return {
    id,
    displayHandle: str(a.display_handle) ?? '',
    fullName: str(a.full_name),
    phone: str(a.phone),
    profilePhotoUrl: str(a.profile_photo_url),
    kycStatus: kycStatusOpt(a.kyc_status),
    ratingAvg: num(a.rating_avg, 0),
    ratingCount: num(a.rating_count, 0),
    totalTripsCompleted: num(a.total_trips_completed, 0),
    currentLat: numOpt(a.current_lat),
    currentLng: numOpt(a.current_lng),
    currentLocationAt: str(a.current_location_at),
    verification: transformVerification(a.verification),
  };
}

/**
 * The joined `driver:drivers(...)` summary on an acceptance / vacancy row. `displayHandle` always
 * present; `fullName` / `profilePhotoUrl` are optional — absent on pre-reveal rows (vacancies are
 * pre-reveal by design; an applicants list to the poster is post-reveal so they'll be set).
 */
export function transformDriverSummary(api: Api, ctx: Api): DriverSummary {
  return {
    id: reqStr(api.id, 'MISSING_FIELD', ctx, 'driver.id'),
    userId: str(api.user_id) ?? '',
    displayHandle: str(api.display_handle) ?? '',
    fullName: str(api.full_name),
    profilePhotoUrl: str(api.profile_photo_url),
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
    tripId: reqStr(api.trip_id, 'MISSING_FIELD', ctx, 'trip_id'),
    driverId: reqStr(api.driver_id, 'MISSING_FIELD', ctx, 'driver_id'),
    driver: transformDriverSummary(driver, ctx),
    vehicleId: str(api.vehicle_id),
    vehicle: vehicle && typeof vehicle === 'object' ? transformVehicleSummary(vehicle) : undefined,
    status: (str(api.status) ?? 'applied') as AcceptanceStatus,
    applicantMessage: str(api.applicant_message),
    applicantQuotedRatePerKm: typeof api.applicant_quoted_rate_per_km === 'number' ? (api.applicant_quoted_rate_per_km as number) : undefined,
    appliedAt: reqStr(api.applied_at, 'MISSING_FIELD', ctx, 'applied_at'),
    decisionAt: str(api.decision_at),
    decisionNote: str(api.decision_note),
  };
}

/** `GET /trips/applied` entry — the caller's own trip_acceptance with its joined (browse-safe) trip. */
export function transformMyApplication(api: Api): MyApplication {
  const ctx = { acceptance_id: str(api.id) ?? '?' };
  const trip = api.trip as Api | undefined;
  if (!trip || typeof trip !== 'object') throw new TripTransformError('application has no joined trip', 'MISSING_FIELD', ctx);
  return {
    acceptanceId: reqStr(api.id, 'MISSING_ID', { api }),
    status: (str(api.status) ?? 'applied') as AcceptanceStatus,
    appliedAt: reqStr(api.applied_at, 'MISSING_FIELD', ctx, 'applied_at'),
    applicantQuotedRatePerKm: typeof api.applicant_quoted_rate_per_km === 'number' ? (api.applicant_quoted_rate_per_km as number) : undefined,
    applicantMessage: str(api.applicant_message),
    trip: transformTrip(trip),
  };
}

// ── write-side ──────────────────────────────────────────────────────────────
export function toApiPostTrip(input: PostTripInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    from_city_id: input.fromCityId,
    to_city_id: input.toCityId,
    from_place_id: input.fromPlaceId ?? null,
    to_place_id: input.toPlaceId ?? null,
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
    ...(input.acceptanceWindowMinutes !== undefined ? { acceptance_window_minutes: input.acceptanceWindowMinutes } : {}),
    driver_instructions: input.driverInstructions ?? null,
    passenger_name: input.passengerName,
    passenger_phone: input.passengerPhone,
    passenger_count: input.passengerCount,
    luggage_notes: input.luggageNotes ?? null,
    special_requests: input.specialRequests ?? null,
    show_fare_to_passenger: input.showFareToPassenger,
    hide_passenger_phone: input.hidePassengerPhone,
  };
  if (input.autoInviteMatches !== undefined) body.auto_invite_matches = input.autoInviteMatches;
  // Migration-071 category fields — omit when unset so legacy callers POST the same shape.
  if (input.tripCategory !== undefined) body.trip_category = input.tripCategory;
  if (input.packageHours !== undefined) body.package_hours = input.packageHours;
  if (input.packageIncludedKm !== undefined) body.package_included_km = input.packageIncludedKm;
  // Migration-024 fields — omit when unset so legacy callers continue to POST the same shape.
  if (input.tripType !== undefined) body.trip_type = input.tripType;
  if (input.expectedEndAt !== undefined) body.expected_end_at = input.expectedEndAt;
  if (Array.isArray(input.waypoints) && input.waypoints.length > 0) {
    body.waypoints = input.waypoints.map((w) => ({
      city_id: w.cityId ?? null,
      place_id: w.placeId ?? null,
      arrive_at: w.arriveAt ?? null,
      wait_minutes: w.waitMinutes ?? 0,
      is_destination: w.isDestination ?? false,
      notes: w.notes ?? null,
    }));
  }
  return body;
}
