export type EligibilityStatus = 'eligible' | 'expiring_soon' | 'expired';

/** A driver's vehicle. `eligibilityStatus` is server-derived (year vs app_settings.min_vehicle_year). */
export interface Vehicle {
  id: string;
  driverId: string;
  makeId?: string;
  makeLabel?: string;
  modelId?: string;
  modelName?: string;
  year: number;
  carTypeId: string;
  carTypeLabel?: string;
  seats: number;
  ac: boolean;
  fuelTypeId?: string;
  fuelTypeLabel?: string;
  registrationNumber: string;
  photoFrontUrl: string;
  photoBackUrl: string;
  photoLeftUrl: string;
  photoRightUrl: string;
  photoInteriorUrl?: string;
  rcBookUrl: string;
  insuranceUrl: string;
  insuranceExpiry?: string;
  permitUrl?: string;
  permitExpiry?: string;
  isPrimary: boolean;
  isActive: boolean;
  eligibilityStatus?: EligibilityStatus;
}

export interface VehicleInput {
  makeId?: string | null;
  modelId?: string | null;
  year: number;
  carTypeId: string;
  seats: number;
  ac: boolean;
  fuelTypeId?: string | null;
  registrationNumber: string;
  photoFrontUrl?: string;
  photoBackUrl?: string;
  photoLeftUrl?: string;
  photoRightUrl?: string;
  photoInteriorUrl?: string | null;
  rcBookUrl?: string;
  insuranceUrl?: string;
  insuranceExpiry?: string | null;
  permitUrl?: string | null;
  permitExpiry?: string | null;
  isPrimary?: boolean;
}
