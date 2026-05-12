import type { CityRow } from './adminConfig';

export type NotifyChannel = 'push' | 'sms' | 'email' | 'in_app';

/** A saved search that fires a notification on a matching trip / vacancy. */
export interface Alert {
  id: string;
  userId: string;
  name: string;
  fromCity: CityRow;
  fromRadiusKm: number;
  toCity?: CityRow;
  toRadiusKm?: number;
  minRatePerKm?: number;
  minCommissionPct?: number;
  carTypeIds: string[];
  pickupWindowStart?: string;
  pickupWindowEnd?: string;
  notifyVia: NotifyChannel[];
  isActive: boolean;
  pausedAt?: string;
  createdAt: string;
}

export interface AlertInput {
  name: string;
  fromCityId: string;
  fromRadiusKm: number;
  toCityId?: string | null;
  toRadiusKm?: number | null;
  minRatePerKm?: number | null;
  minCommissionPct?: number | null;
  carTypeIds?: string[];
  pickupWindowStart?: string | null;
  pickupWindowEnd?: string | null;
  notifyVia?: NotifyChannel[];
  isActive?: boolean;
}
