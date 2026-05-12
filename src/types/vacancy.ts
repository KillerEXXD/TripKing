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
