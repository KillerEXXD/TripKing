import type { CityRow } from './adminConfig';
import type { VehicleSummary } from './trip';

export type KycStatus = 'pending' | 'docs_submitted' | 'video_pending' | 'approved' | 'rejected' | 'resubmit_required';

/** A driver's public marketplace profile (+ owner-only fields when self). */
export interface Driver {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  email?: string;
  homeCity?: CityRow;
  currentCity?: CityRow;
  currentLat?: number;
  currentLng?: number;
  profilePhotoUrl: string;
  kycStatus: KycStatus;
  ratingAvg: number;
  ratingCount: number;
  ratingDistribution: Record<'1' | '2' | '3' | '4' | '5', number>;
  /** top positive passenger→driver tags. */
  topTags: string[];
  /** top positive agent→driver tags. */
  managerTopTags: string[];
  totalTripsCompleted: number;
  vehicles: VehicleSummary[];
}

/** A trip manager (agent) — public profile. */
export interface Agent {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  email?: string;
  businessName?: string;
  businessCity?: CityRow;
  profilePhotoUrl: string;
  kycStatus: KycStatus;
  topTags: string[];
  totalTripsPosted: number;
}

export interface DriversQueryParams {
  currentCityId?: string;
  kycStatus?: KycStatus;
  page?: number;
  limit?: number;
  sort?: string;
}
export interface UpdateDriverInput {
  fullName?: string;
  email?: string;
  homeCityId?: string;
  currentCityId?: string;
  profilePhotoUrl?: string;
}

/**
 * Body for "create my driver profile" — `POST /drivers` with `role:'driver'`
 * (`driver_id` auto, `user_id = auth.uid()`). The cross-lane contract; see
 * `docs/CONTINUE_HERE_BACKEND.md`. `role` is set by the service fn, not the caller.
 */
export interface CreateDriverProfileInput {
  fullName: string;
  homeCityId: string;
  email?: string;
}

/**
 * Body for "create my agent profile" — `POST /drivers` with `role:'trip_manager'`
 * (the route writes a `trip_managers` row). The agent's city is `business_city_id`.
 */
export interface CreateAgentProfileInput {
  fullName: string;
  businessCityId: string;
  email?: string;
  businessName?: string;
}
export interface UpdateLocationInput {
  cityId?: string;
  lat?: number;
  lng?: number;
}
