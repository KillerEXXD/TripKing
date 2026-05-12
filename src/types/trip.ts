import type { CityRow } from './adminConfig';

export type TripStatus = 'open' | 'has_applicants' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
export type PosterRole = 'driver' | 'trip_manager';
export type AcceptanceStatus = 'applied' | 'selected' | 'rejected' | 'withdrawn' | 'expired';

export interface Trip {
  id: string;
  postedByUserId: string;
  postedByRole: PosterRole;
  postedByName: string;
  postedByPhone?: string;
  fromCity: CityRow;
  toCity: CityRow;
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
}

/** The assigned driver as embedded on a `Trip` (joined `drivers` row + last reported position). */
export interface AssignedDriver {
  id: string;
  fullName: string;
  /** Present on `GET /trips/:id` and the passenger-portal lookup (not on the public list). */
  phone?: string;
  profilePhotoUrl: string;
  ratingAvg: number;
  ratingCount: number;
  totalTripsCompleted: number;
  currentLat?: number;
  currentLng?: number;
  currentLocationAt?: string;
}

/** Lightweight driver summary embedded in an applicant card / assigned-trip card. */
export interface DriverSummary {
  id: string;
  fullName: string;
  profilePhotoUrl: string;
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
  fromCityId: string;
  toCityId: string;
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
  page?: number;
  limit?: number;
  sort?: string;
}
