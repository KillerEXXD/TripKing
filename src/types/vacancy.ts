import type { CityRow } from './adminConfig';
import type { NearRadius, Place } from './place';
import type { DriverSummary, VehicleSummary } from './trip';

export type VacancyStatus = 'active' | 'matched' | 'expired' | 'cancelled';

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
// ── vacancy-invitations ──────────────────────────────────────────────────────
export type VacancyInvitationStatus = 'pending' | 'accepted' | 'declined' | 'expired';

/**
 * An agent's invitation for the driver behind a vacancy to one of their open trips.
 * Driver-side PII on the `driver` field is `DriverSummary` (handle + trust signals only)
 * until the invitation is accepted; once accepted the server returns the full identity.
 */
export interface VacancyInvitation {
  id: string;
  vacancyId: string;
  tripId: string;
  invitedByUserId: string;
  /** Inviter's display handle (always present). */
  inviterHandle: string;
  /** Inviter's display name — surfaced to admin and to the inviting agent only. */
  inviterName?: string;
  driverId: string;
  driver?: DriverSummary;
  status: VacancyInvitationStatus;
  message?: string;
  expiresAt: string;
  decidedAt?: string;
  createdAt: string;
  trip?: {
    id: string;
    status: string;
    pickupAt: string;
    expectedDistanceKm: number;
    totalFare: number;
    driverPayout: number;
    fromCity?: CityRow;
    toCity?: CityRow;
  };
  vacancy?: {
    id: string;
    status: VacancyStatus;
    currentCity?: CityRow;
  };
}

export interface CreateVacancyInvitationInput {
  vacancyId: string;
  tripId: string;
  message?: string;
}

export interface VacancyInvitationsQueryParams {
  /** `'driver'` → mine-received; `'agent'` → mine-sent; omit for both (or admin: all). */
  role?: 'driver' | 'agent';
}

export interface VacanciesQueryParams {
  currentCityId?: string;
  destinationCityId?: string;
  destinationPlaceId?: string;
  status?: VacancyStatus;
  driverId?: string;
  /** Restrict to drivers whose current point is within the radius (nearest first). */
  near?: NearRadius;
  page?: number;
  limit?: number;
  sort?: string;
}
