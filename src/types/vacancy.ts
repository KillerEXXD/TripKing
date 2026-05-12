import type { CityRow } from './adminConfig';
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
  availableFrom: string;
  availableUntil?: string;
  destinationCities: CityRow[];
  minRatePerKm?: number;
  notes?: string;
  status: VacancyStatus;
  cancelledAt?: string;
  createdAt: string;
}

export interface PostVacancyInput {
  vehicleId?: string;
  currentCityId: string;
  availableFrom: string;
  availableUntil?: string;
  destinationCityIds: string[];
  minRatePerKm?: number;
  notes?: string;
}
export interface VacanciesQueryParams {
  currentCityId?: string;
  destinationCityId?: string;
  status?: VacancyStatus;
  driverId?: string;
  page?: number;
  limit?: number;
  sort?: string;
}
