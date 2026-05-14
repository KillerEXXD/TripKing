import type { CityRow } from './adminConfig';
import type { NearRadius, Place } from './place';

export type TripStatus = 'open' | 'has_applicants' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
export type PosterRole = 'driver' | 'trip_manager';
export type AcceptanceStatus = 'applied' | 'selected' | 'rejected' | 'withdrawn' | 'expired';
/** Migration 024: the *shape* of the route. */
export type TripType = 'one_way' | 'round_trip' | 'multi_way';

/** One stop in a trip's itinerary. seq=0 is the origin; the highest seq is the final destination. */
export interface Waypoint {
  id: string;
  seq: number;
  city?: CityRow;
  place?: Place;
  /** Expected arrival; null on seq=0 (the origin time is `Trip.pickupAt`). */
  arriveAt?: string;
  /** How long the driver waits here (paid via `app_settings.wait_rate_per_min`). */
  waitMinutes: number;
  /** Agent's marker — a paying stop (vs a transit-only waypoint). */
  isDestination: boolean;
  notes?: string;
}

/** Body shape on POST /trips for a single waypoint (camelCase). */
export interface WaypointInput {
  cityId?: string;
  placeId?: string;
  arriveAt?: string;
  waitMinutes?: number;
  isDestination?: boolean;
  notes?: string;
}

export interface Trip {
  id: string;
  /** Route shape (migration 024). Optional for back-compat; transforms default to `one_way`. */
  tripType?: TripType;
  /** Trip end timestamp — the driver is committed until then. Multi-day trips have a real span. */
  expectedEndAt?: string;
  /** Ordered list of waypoints (origin → 0+ stops → final). Optional; transforms default to `[]`. */
  waypoints?: Waypoint[];
  postedByUserId: string;
  postedByRole: PosterRole;
  /** Stable opaque poster identifier (e.g. "A3E5A6E") — always present, even on a browse-safe view. */
  postedByHandle: string;
  /** The poster's name. Absent on a browse view to a viewer who hasn't applied; revealed once `can_reveal_agent` fires. */
  postedByName?: string;
  postedByPhone?: string;
  fromCity: CityRow;
  toCity: CityRow;
  /** Precise pickup / drop points, when the poster pinned them (alongside `fromCity` / `toCity`). */
  fromPlace?: Place;
  toPlace?: Place;
  pickupAt: string;
  expectedDistanceKm: number;
  carTypeId: string;
  /** joined label from car_types (display only). */
  carTypeLabel?: string;
  seatsRequired: number;
  acRequired: boolean;
  ratePerKm: number;
  totalFare: number;
  commissionPct: number;
  /** flat ₹ amount. */
  gstAmount: number;
  driverBata: number;
  extrasPaidByPassenger: boolean;
  driverInstructions?: string;
  /** server-computed (fare − commission − GST + bata) — never recomputed in the client. */
  driverPayout: number;
  /** Empty string means passenger details have not been entered yet. */
  passengerName: string;
  passengerPhone: string;
  passengerCount: number;
  luggageNotes?: string;
  specialRequests?: string;
  status: TripStatus;
  assignedDriverId?: string;
  assignedVehicleId?: string;
  assignedAcceptanceId?: string;
  assignedAt?: string;
  /** Stable opaque handle for the assigned driver (e.g. "A3E5A6E") — present once a driver is assigned, even on a browse-safe view. */
  assignedDriverHandle?: string;
  /** The assigned driver, joined server-side (with live position). Present once a driver is assigned. */
  assignedDriver?: AssignedDriver;
  /** Server-computed straight-line km from the assigned driver's last position to the drop-off city (in-progress trips only). */
  distanceToDestinationKm?: number;
  showFareToPassenger: boolean;
  hidePassengerPhone: boolean;
  cancelledAt?: string;
  cancelReasonId?: string;
  applicantCount: number;
  createdAt: string;
  /** The passenger OTP — echoed only to the trip poster / admin (or returned by `POST /trips/:id/assign`). Used to build the passenger-portal link. */
  passengerOtp?: string;
  /** Straight-line km from the `?near_*` centre to the pickup point — present only on a radius-filtered list. */
  distanceKm?: number;
}

/**
 * The assigned driver as embedded on a `Trip` (joined `drivers` row + last reported position).
 * `fullName` / `phone` / `profilePhotoUrl` are absent on a browse-safe view (the viewer hasn't
 * crossed the reveal gate); `displayHandle` is always present.
 */
export interface AssignedDriver {
  id: string;
  /** Stable opaque per-driver identifier. */
  displayHandle: string;
  fullName?: string;
  phone?: string;
  profilePhotoUrl?: string;
  ratingAvg: number;
  ratingCount: number;
  totalTripsCompleted: number;
  currentLat?: number;
  currentLng?: number;
  currentLocationAt?: string;
}

/**
 * Lightweight driver summary embedded in an applicant card / assigned-trip card.
 * Identity fields (`fullName` / `profilePhotoUrl`) are absent when the row is rendered pre-reveal
 * (e.g. a vacancy's `driver` field is always pre-reveal by design).
 */
export interface DriverSummary {
  id: string;
  userId: string;
  /** Stable opaque per-driver identifier. */
  displayHandle: string;
  fullName?: string;
  profilePhotoUrl?: string;
  ratingAvg: number;
  ratingCount: number;
  totalTripsCompleted: number;
  topTags: string[];
  currentCity?: CityRow;
}
export interface VehicleSummary {
  id: string;
  makeLabel?: string;
  modelName?: string;
  year: number;
  carTypeLabel?: string;
  seats: number;
  ac: boolean;
}

/** An entry in "my applications" (`GET /trips/applied`) — a trip_acceptance of the caller's, with its joined trip. */
export interface MyApplication {
  acceptanceId: string;
  status: AcceptanceStatus;
  appliedAt: string;
  applicantQuotedRatePerKm?: number;
  applicantMessage?: string;
  trip: Trip;
}

export interface TripAcceptance {
  id: string;
  tripId: string;
  driverId: string;
  driver: DriverSummary;
  vehicleId?: string;
  vehicle?: VehicleSummary;
  status: AcceptanceStatus;
  applicantMessage?: string;
  applicantQuotedRatePerKm?: number;
  appliedAt: string;
  decisionAt?: string;
  decisionNote?: string;
}

// ── write-side inputs ───────────────────────────────────────────────────────
export interface PostTripInput {
  /** Route shape (migration 024). When omitted the server defaults to `one_way`. */
  tripType?: TripType;
  /** Ordered waypoints — preferred over `fromCityId`/`toCityId` for round_trip / multi_way / any
   *  trip with intermediate stops. Required when `tripType` is round_trip or multi_way. */
  waypoints?: WaypointInput[];
  /** Trip end timestamp. Server defaults to last-waypoint `arriveAt + waitMinutes`, or
   *  `pickupAt + 1 day` for legacy single-leg shapes. */
  expectedEndAt?: string;
  /** Legacy single-leg shape — when both are supplied without `waypoints`, the server synthesises
   *  a 2-waypoint `one_way` plan. Today's clients keep working unchanged. */
  fromCityId: string;
  toCityId: string;
  /** Optional precise pickup / drop points (`places.id`s). */
  fromPlaceId?: string;
  toPlaceId?: string;
  pickupAt: string;
  expectedDistanceKm: number;
  carTypeId: string;
  seatsRequired: number;
  acRequired: boolean;
  ratePerKm: number;
  totalFare: number;
  commissionPct: number;
  gstAmount: number;
  driverBata: number;
  extrasPaidByPassenger: boolean;
  driverInstructions?: string;
  passengerName: string;
  passengerPhone: string;
  passengerCount: number;
  luggageNotes?: string;
  specialRequests?: string;
  showFareToPassenger: boolean;
  hidePassengerPhone: boolean;
}
export interface UpdateTripPassengerInput {
  passengerName?: string;
  passengerPhone?: string;
  passengerCount?: number;
  luggageNotes?: string;
  specialRequests?: string;
  hidePassengerPhone?: boolean;
}
export interface ApplyToTripInput {
  vehicleId: string;
  quotedRatePerKm?: number;
  message?: string;
}
export interface TripsQueryParams {
  status?: TripStatus | TripStatus[];
  fromCityId?: string;
  toCityId?: string;
  postedByUserId?: string;
  /** A driver uuid, or the literal `'me'` — the trips assigned to (being driven by) that driver. */
  assignedDriverId?: string;
  /** Restrict to trips whose pickup point is within the radius (nearest first). */
  near?: NearRadius;
  page?: number;
  limit?: number;
  sort?: string;
}
