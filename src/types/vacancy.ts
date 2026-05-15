import type { CityRow } from './adminConfig';
import type { NearRadius, Place } from './place';
import type { DriverSummary, VehicleSummary } from './trip';

export type VacancyStatus = 'active' | 'matched' | 'on_trip' | 'expired' | 'cancelled';

/** Slim summary of the trip that consumed this vacancy — present only when status='on_trip' (migration 039). */
export interface VacancyLinkedTrip {
  id: string;
  pickupAt: string;
  fromCityName?: string;
  toCityName?: string;
}

/**
 * One invitation the *current viewer* (an agent/admin) has already sent to this vacancy's driver.
 * Server-attached, viewer-scoped, status ∈ {pending, applied}. Drives the "N invites sent" badge
 * on VacancyCard and the "Already invited" disabled rows in InviteToTripDialog. Absent for
 * anonymous / driver callers.
 */
export interface VacancyInviteSummary {
  id: string;
  tripId: string;
  status: 'pending' | 'applied';
  pickupAt: string;
  fromCityName?: string;
  toCityName?: string;
  createdAt: string;
}

/** "I'm available in city X, willing to drive to one of these destinations." */
export interface Vacancy {
  id: string;
  driverId: string;
  driver?: DriverSummary;
  vehicleId?: string;
  vehicle?: VehicleSummary;
  currentCity: CityRow;
  /** Precise current location, when the driver pinned one (alongside `currentCity`). */
  currentPlace?: Place;
  availableFrom: string;
  availableUntil?: string;
  destinationCities: CityRow[];
  /** Precise destination places, when picked (a destination row may be a place, a city, or both). */
  destinationPlaces: Place[];
  minRatePerKm?: number;
  notes?: string;
  status: VacancyStatus;
  cancelledAt?: string;
  createdAt: string;
  /** Straight-line km from the `?near_*` centre to the driver's current point — present only on a radius-filtered list. */
  distanceKm?: number;
  /** Set when this vacancy has been suspended by an accepted trip (status='on_trip'). */
  linkedTripId?: string;
  linkedTrip?: VacancyLinkedTrip;
  /** Invites the current viewer has already sent to this driver (server-scoped to viewer; absent for anon/driver). */
  myInvites?: VacancyInviteSummary[];
}

/** One destination on a posted vacancy — a curated city, a precise place, or both (≥1 required). */
export interface VacancyDestinationInput {
  cityId?: string;
  placeId?: string;
}

export interface PostVacancyInput {
  vehicleId?: string;
  currentCityId: string;
  /** Optional precise current location (a `places.id`). */
  currentPlaceId?: string;
  availableFrom: string;
  availableUntil?: string;
  destinationCityIds: string[];
  /**
   * Preferred: the unified destinations list (each entry a city, a place, or both) — `POST /vacancies`
   * creates one `vacancy_destinations` row per entry. When set, the server ignores `destinationCityIds`
   * / `destinationPlaceIds`. (Those remain the legacy fallback.)
   */
  destinations?: VacancyDestinationInput[];
  /** Legacy: precise destination places (`places.id`s) — paired index-wise with `destinationCityIds`. */
  destinationPlaceIds?: string[];
  minRatePerKm?: number;
  notes?: string;
}
export interface VacanciesQueryParams {
  currentCityId?: string;
  destinationCityId?: string;
  destinationPlaceId?: string;
  /** A single status, or an array — serialised as a comma-separated `?status=` for the backend. */
  status?: VacancyStatus | VacancyStatus[];
  driverId?: string;
  /** Restrict to drivers whose current point is within the radius (nearest first). */
  near?: NearRadius;
  page?: number;
  limit?: number;
  sort?: string;
}
