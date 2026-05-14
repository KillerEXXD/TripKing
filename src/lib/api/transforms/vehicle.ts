/** Vehicle transforms — strict on id/driver_id/year/car_type_id; make/model/car_type/fuel_type joined server-side; eligibilityStatus is server-derived. */
import { ApiTransformError } from '@/lib/api/transforms/base';
import type { EligibilityStatus, Vehicle, VehicleInput } from '@/types';

export type VehicleTransformErrorCode = 'MISSING_ID' | 'MISSING_DRIVER_ID' | 'MISSING_YEAR' | 'MISSING_CAR_TYPE';
export class VehicleTransformError extends ApiTransformError<VehicleTransformErrorCode> {}
type Api = Record<string, unknown>;
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}
function reqStr(v: unknown, code: VehicleTransformErrorCode, ctx: Api): string {
  const s = str(v);
  if (!s) throw new VehicleTransformError(`missing ${code}`, code, ctx);
  return s;
}
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : fallback;
}
function reqNum(v: unknown, code: VehicleTransformErrorCode, ctx: Api): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) throw new VehicleTransformError(`missing ${code}`, code, ctx);
  return n;
}

export function transformVehicle(api: Api): Vehicle {
  const id = reqStr(api.id, 'MISSING_ID', { api });
  const ctx = { vehicle_id: id };
  const elig = str(api.eligibility_status);
  return {
    id,
    driverId: reqStr(api.driver_id, 'MISSING_DRIVER_ID', ctx),
    makeId: str(api.make_id),
    makeLabel: str((api.make as Api | undefined)?.name) ?? str(api.make_label),
    modelId: str(api.model_id),
    modelName: str((api.model as Api | undefined)?.name) ?? str(api.model_name),
    year: reqNum(api.year, 'MISSING_YEAR', ctx),
    carTypeId: reqStr(api.car_type_id, 'MISSING_CAR_TYPE', ctx),
    carTypeLabel: str((api.car_type as Api | undefined)?.label) ?? str(api.car_type_label),
    seats: num(api.seats, 4),
    ac: typeof api.ac === 'boolean' ? api.ac : true,
    fuelTypeId: str(api.fuel_type_id),
    fuelTypeLabel: str((api.fuel_type as Api | undefined)?.label) ?? str(api.fuel_type_label),
    registrationNumber: str(api.registration_number) ?? '',
    photoFrontUrl: str(api.photo_front_url) ?? '',
    photoBackUrl: str(api.photo_back_url) ?? '',
    photoLeftUrl: str(api.photo_left_url) ?? '',
    photoRightUrl: str(api.photo_right_url) ?? '',
    photoPlateUrl: str(api.photo_plate_url) ?? '',
    photoInteriorUrl: str(api.photo_interior_url),
    rcBookUrl: str(api.rc_book_url) ?? '',
    insuranceUrl: str(api.insurance_url) ?? '',
    insuranceExpiry: str(api.insurance_expiry),
    permitUrl: str(api.permit_url),
    permitExpiry: str(api.permit_expiry),
    isPrimary: typeof api.is_primary === 'boolean' ? api.is_primary : false,
    isActive: typeof api.is_active === 'boolean' ? api.is_active : true,
    eligibilityStatus: elig === 'eligible' || elig === 'expiring_soon' || elig === 'expired' ? (elig as EligibilityStatus) : undefined,
  };
}

export function toApiVehicle(input: Partial<VehicleInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const map: Record<string, string> = {
    makeId: 'make_id',
    modelId: 'model_id',
    year: 'year',
    carTypeId: 'car_type_id',
    seats: 'seats',
    ac: 'ac',
    fuelTypeId: 'fuel_type_id',
    registrationNumber: 'registration_number',
    photoFrontUrl: 'photo_front_url',
    photoBackUrl: 'photo_back_url',
    photoLeftUrl: 'photo_left_url',
    photoRightUrl: 'photo_right_url',
    photoPlateUrl: 'photo_plate_url',
    photoInteriorUrl: 'photo_interior_url',
    rcBookUrl: 'rc_book_url',
    insuranceUrl: 'insurance_url',
    insuranceExpiry: 'insurance_expiry',
    permitUrl: 'permit_url',
    permitExpiry: 'permit_expiry',
    isPrimary: 'is_primary',
  };
  for (const [k, col] of Object.entries(map)) {
    const v = (input as Record<string, unknown>)[k];
    if (v !== undefined) out[col] = v;
  }
  return out;
}
