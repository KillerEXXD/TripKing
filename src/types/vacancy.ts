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

export interface PostVacancyInput {
  vehicleId?: string;
  currentCityId: string;
  /** Optional precise current location (a `places.id`). */
  currentPlaceId?: string;
  availableFrom: string;
  availableUntil?: string;
  destinationCityIds: string[];
  /** Optional precise destination places (`places.id`s) — when set, these become the destination rows (paired index-wise with `destinationCityIds`, or place-only). */
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
