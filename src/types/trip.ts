import type { CityRow } from './adminConfig';
import type { NearRadius, Place } from './place';
import type { KycStatus, VerificationSummary } from './driver';

export type TripStatus = 'open' | 'has_applicants' | 'selected' | 'accepted' | 'in_progress' | 'completed' | 'cancelled';
/** Phase 2 of the two-step handshake — drives the driver's Accept/Decline card. Null on trips that pre-date the handshake. */
export type DriverAcceptanceStatus = 'pending' | 'accepted' | 'declined' | 'expired';
export type PosterRole = 'driver' | 'trip_manager';
export type AcceptanceStatus = 'applied' | 'selected' | 'accepted' | 'rejected' | 'withdrawn' | 'expired';
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
  /** The poster's KYC status — feeds the inline "Verified" badge on cards. Server sends this even pre-reveal. */
  postedByKycStatus?: KycStatus;
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
  /** Two-step-handshake fields (migration 030). All NULL until Phase 2 wires the flow. */
  acceptanceWindowMinutes: number;
  acceptanceDeadlineAt?: string;
  driverAcceptanceStatus?: DriverAcceptanceStatus;
  assignedDriverId?: string;
  assignedVehicleId?: string;
  assignedAcceptanceId?: string;
  assignedAt?: string;
  /** Stable opaque handle for the assigned driver (e.g. "A3E5A6E") — present once a driver is assigned, even on a browse-safe view. */
  assignedDriverHandle?: string;
  /** The assigned driver, joined server-side (with live position). Present once a driver is assigned. */
  assignedDriver?: AssignedDriver;
  /**
   * Server-computed KYC checklist for the POSTER — attached on GET /trips/:id when the viewer is
   * the assigned driver. Lets the assigned driver see how thoroughly the agent who hired them is
   * verified (doc/video steps marked done, no document URLs). Absent for other viewers.
   */
  postedByVerification?: VerificationSummary;
  /** Server-computed straight-line km from the assigned driver's last position to the drop-off city (in-progress trips only). */
  distanceToDestinationKm?: number;
  showFareToPassenger: boolean;
  hidePassengerPhone: boolean;
  cancelledAt?: string;
  cancelReasonId?: string;
  applicantCount: number;
  /** Number of `trip_invitations` rows in status='pending' for this trip — drives the "Invited" chip on `/posted-trips`. Always present (server defaults to 0). */
  pendingInvitationCount: number;
  /** Only present on the response from POST /trips when auto-invite ran. Drives the success toast. */
  autoInvitedCount?: number;
  /** Only present on `GET /trips?invited=me` rows — the `trip_invitations.id` matching the caller. Drives the "Unavailable" decline action on the driver's Invited tab. */
  invitationId?: string;
  /** Only present on `GET /trips?invited=me` rows — the caller's invitation status (`pending` | `applied` — declined invites are filtered out of the list). */
  invitationStatus?: TripInvitationStatus;
  /** Only present on `GET /trips/:id` for a driver — the caller's most recent trip_acceptances row id (if any). Drives the "Applied / Withdraw" affordance on the trip detail. */
  myApplicationId?: string;
  /** Only present on `GET /trips/:id` for a driver — the caller's most recent trip_acceptances status. */
  myApplicationStatus?: AcceptanceStatus;
  createdAt: string;
  /** The passenger OTP — echoed only to the trip poster / admin (or returned by `POST /trips/:id/assign`). Used to build the passenger-portal link. */
  passengerOtp?: string;
  /** Straight-line km from the `?near_*` centre to the pickup point — present only on a radius-filtered list. */
  distanceKm?: number;
  /**
   * Stage 3 of the referral program — server-computed dual-side platform-fee charges,
   * present on completed trips. Empty `{}` until the trip completes (or no rows in `platform_fee_charges`).
   */
  platformFeeBreakdown?: Partial<Record<'driver' | 'agent', PlatformFeeChargeSummary>>;
}

export type PlatformFeeChargeStatus = 'pending' | 'charged' | 'failed' | 'refunded';

export interface PlatformFeeChargeSummary {
  amountPaise: number;
  /** Which sub-balance / source paid (e.g. `cash_wallet`, `direct_upi`, `promo_credit`). */
  paymentSource: string;
  status: PlatformFeeChargeStatus;
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
  /** The driver's KYC state; present whenever the joined `drivers` row is revealed (poster/admin/self views). */
  kycStatus?: KycStatus;
  ratingAvg: number;
  ratingCount: number;
  totalTripsCompleted: number;
  currentLat?: number;
  currentLng?: number;
  currentLocationAt?: string;
  /**
   * Server-computed KYC checklist; attached on GET /trips/:id only, and only to the poster/admin
   * (so they can see the verification state of their assigned driver). Lists which steps the
   * driver has completed — no document URLs.
   */
  verification?: VerificationSummary;
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
  /** Optional — present on summaries the server enriches with trust signals (vacancy.driver). */
  kycStatus?: KycStatus;
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
  /** Phase 1 of the two-step handshake — how long the selected driver has to Accept. 5–30, default 15. */
  acceptanceWindowMinutes?: number;
  extrasPaidByPassenger: boolean;
  driverInstructions?: string;
  passengerName: string;
  passengerPhone: string;
  passengerCount: number;
  luggageNotes?: string;
  specialRequests?: string;
  showFareToPassenger: boolean;
  hidePassengerPhone: boolean;
  /**
   * When true (the default on the form), the server auto-invites the up-to-5 nearest
   * KYC-approved drivers whose open vacancy is within app_settings.invite_max_radius_km
   * of the pickup city. Same eligibility/radius rules as a manual invite. Omit to inherit
   * the server default (true).
   */
  autoInviteMatches?: boolean;
}
/** Counts-only response from `GET /trips/match-preview` — drives the form preview + the Post-button gate. */
export interface TripMatchPreview {
  totalMatches: number;
  willInvite: number;
  maxInvites: number;
}
/**
 * Edit a trip's commercial / scheduling / vehicle fields. Server enforces
 * `status === 'open'` — once a driver has applied / been invited / been
 * selected, the trip is locked and the PATCH returns 409. Route (cities,
 * waypoints, distance) is intentionally NOT editable here — changing the
 * route is effectively a new trip.
 */
export interface UpdateTripDetailsInput {
  ratePerKm?: number;
  driverBata?: number;
  commissionPct?: number;
  gstAmount?: number;
  pickupAt?: string;
  carTypeId?: string;
  acRequired?: boolean;
  seatsRequired?: number;
  driverInstructions?: string | null;
  extrasPaidByPassenger?: boolean;
  showFareToPassenger?: boolean;
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
export type TripInvitationStatus = 'pending' | 'applied' | 'declined' | 'withdrawn' | 'expired';
/** Phase 4 of the two-step handshake — agent invites a specific driver to view a trip. */
export interface TripInvitation {
  id: string;
  tripId?: string;
  driverId: string;
  status: TripInvitationStatus;
  declinedReason?: string;
  createdAt: string;
  updatedAt: string;
  driver?: DriverSummary;
}
export interface TripsQueryParams {
  status?: TripStatus | TripStatus[];
  fromCityId?: string;
  toCityId?: string;
  postedByUserId?: string;
  /** A driver uuid, or the literal `'me'` — the trips assigned to (being driven by) that driver. */
  assignedDriverId?: string;
  /** Phase 4: `'me'` → only trips the caller has been invited to. */
  invited?: 'me';
  /** Restrict to trips whose pickup point is within the radius (nearest first). */
  near?: NearRadius;
  page?: number;
  limit?: number;
  /** Offset into the result set (0-based). Pair with `limit` for infinite-scroll pagination. */
  offset?: number;
  sort?: string;
}
