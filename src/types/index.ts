/**
 * Shared domain types for DriverMahal.
 * One source of truth — pages, components, hooks, services all import from here.
 */

export type UserRole = 'driver' | 'trip_manager' | 'admin';

export type LanguageCode = 'en' | 'ta' | 'hi';

export type KycStatus =
  | 'pending'
  | 'docs_submitted'
  | 'video_pending'
  | 'approved'
  | 'rejected'
  | 'resubmit_required';

export type CarType =
  | 'Hatchback'
  | 'Sedan'
  | 'SUV'
  | 'Innova'
  | 'Tempo Traveller'
  | 'Mini Bus';

export type FuelType = 'Petrol' | 'Diesel' | 'CNG' | 'EV';

export type EligibilityStatus = 'eligible' | 'expiring_soon' | 'expired';

export type TripStatus =
  | 'open'
  | 'has_applicants'
  | 'assigned'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type AcceptanceStatus =
  | 'applied'
  | 'selected'
  | 'rejected'
  | 'withdrawn'
  | 'expired';

export interface User {
  id: string;
  role: UserRole;
  phone: string;
  email?: string;
  displayName: string;
  isActive: boolean;
}

export interface City {
  id: string;
  name: string;
  state: string;
  lat: number;
  lng: number;
}

export interface Driver {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  email?: string;
  homeCity: City;
  currentCity: City;
  profilePhotoUrl: string;
  preferredLanguage: LanguageCode;
  kycStatus: KycStatus;
  ratingAvg: number;
  ratingCount: number;
  ratingDistribution: Record<1 | 2 | 3 | 4 | 5, number>;
  topTags: string[];
  totalTripsCompleted: number;
  vehicles: Vehicle[];
}

export interface TripManager {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  email?: string;
  businessName?: string;
  businessCity: City;
  profilePhotoUrl: string;
  preferredLanguage: LanguageCode;
  kycStatus: KycStatus;
  totalTripsPosted: number;
}

export interface Vehicle {
  id: string;
  driverId: string;
  make: string;
  model: string;
  year: number;
  retirementYear: number;
  eligibilityStatus: EligibilityStatus;
  registrationNumber: string;
  carType: CarType;
  seats: number;
  ac: boolean;
  fuelType: FuelType;
  photoFrontUrl: string;
  photoBackUrl: string;
  photoLeftUrl: string;
  photoRightUrl: string;
  rcBookUrl: string;
  insuranceUrl: string;
  insuranceExpiry: string;
  permitUrl?: string;
  permitExpiry?: string;
  isPrimary: boolean;
  isActive: boolean;
}

export interface VacancyPost {
  id: string;
  driverId: string;
  vehicleId: string;
  currentCity: City;
  availableFrom: string;
  availableUntil?: string;
  destinationCities: City[];
  minRatePerKm?: number;
  notes?: string;
  status: 'active' | 'matched' | 'expired' | 'cancelled';
}

export interface Trip {
  id: string;
  postedByUserId: string;
  postedByRole: 'driver' | 'trip_manager';
  postedByName: string;
  /** Poster's contact number — shown to drivers in the share message + the app. */
  postedByPhone?: string;
  fromCity: City;
  toCity: City;
  pickupDateTime: string;
  expectedDistanceKm: number;
  carTypeRequired: CarType;
  seatsRequired: number;
  acRequired: boolean;
  ratePerKm: number;
  totalFare: number;
  commissionPct: number;
  gstAmount: number;
  /** Flat bata that goes directly to the driver, on top of the fare. ₹300 default. */
  driverBata?: number;
  /** Packing / toll / permit charges are extra and paid by the passenger (default true). */
  extrasPaidByPassenger?: boolean;
  /** Newline-separated instructions the driver must follow. Editable by the poster. */
  driverInstructions?: string;
  driverPayout: number;
  passengerName: string;
  passengerPhone: string;
  passengerCount: number;
  luggageNotes?: string;
  specialRequests?: string;
  status: TripStatus;
  applicantCount: number;
  assignedDriverId?: string;
  assignedVehicleId?: string;
  createdAt: string;
}

export interface TripAcceptance {
  id: string;
  tripId: string;
  driverId: string;
  driver: Pick<
    Driver,
    | 'id'
    | 'fullName'
    | 'profilePhotoUrl'
    | 'ratingAvg'
    | 'ratingCount'
    | 'totalTripsCompleted'
    | 'topTags'
    | 'currentCity'
  >;
  vehicleId: string;
  vehicle: Pick<Vehicle, 'make' | 'model' | 'year' | 'carType' | 'seats' | 'ac'>;
  status: AcceptanceStatus;
  applicantMessage?: string;
  applicantQuotedRatePerKm?: number;
  appliedAt: string;
  decisionAt?: string;
  decisionNote?: string;
}

export interface Alert {
  id: string;
  userId: string;
  name: string;
  fromCity: City;
  fromRadiusKm: number;
  toCity?: City;
  toRadiusKm?: number;
  minRatePerKm?: number;
  minCommissionPct?: number;
  carTypes?: CarType[];
  pickupWindowStart?: string;
  pickupWindowEnd?: string;
  notifyVia: ('push' | 'sms' | 'email' | 'in_app')[];
  isActive: boolean;
}

export interface Review {
  id: string;
  tripId: string;
  raterUserId: string;
  raterRole: UserRole;
  rateeUserId: string;
  direction: 'manager_to_driver' | 'driver_to_manager';
  score: 1 | 2 | 3 | 4 | 5;
  comment: string;
  tags: string[];
  isPublished: boolean;
  isFlagged: boolean;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  type:
    | 'alert_match'
    | 'kyc_status_change'
    | 'trip_assigned'
    | 'trip_cancelled'
    | 'trip_completed'
    | 'review_received';
  title: string;
  body: string;
  payloadJson: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

export interface AppSettings {
  minVehicleYear: number;
  vehicleExpiryWarningDays: number;
  defaultAlertRadiusKm: number;
  defaultCommissionPct: number;
  defaultGstPct: number;
}
