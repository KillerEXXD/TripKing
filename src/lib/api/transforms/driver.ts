/**
 * Driver / agent transforms — strict (throw on missing id / user_id; cities and
 * vehicles are joined server-side). Never compute reputation/eligibility here.
 */
import { transformCity } from '@/lib/api/transforms/adminConfig';
import { maybePlace } from '@/lib/api/transforms/place';
import type { Agent, CreateAgentProfileInput, CreateDriverProfileInput, Driver, KycStatus, VehicleSummary } from '@/types';

export type DriverTransformErrorCode = 'MISSING_ID' | 'MISSING_USER_ID';
export class DriverTransformError extends Error {
  constructor(message: string, public code: DriverTransformErrorCode, public context: Record<string, unknown> = {}) {
    super(message);
    this.name = 'DriverTransformError';
  }
}

type Api = Record<string, unknown>;
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}
function reqStr(v: unknown, code: DriverTransformErrorCode, ctx: Api): string {
  const s = str(v);
  if (!s) throw new DriverTransformError(`missing ${code}`, code, ctx);
  return s;
}
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : fallback;
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === 'string') : [];
}
function maybeCity(v: unknown) {
  return v && typeof v === 'object' ? transformCity(v as Api) : undefined;
}
function ratingDist(v: unknown): Record<'1' | '2' | '3' | '4' | '5', number> {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return { '1': num(o['1']), '2': num(o['2']), '3': num(o['3']), '4': num(o['4']), '5': num(o['5']) };
}

function vehicleSummary(api: Api): VehicleSummary {
  return {
    id: str(api.id) ?? '',
    makeLabel: str((api.make as Api | undefined)?.name) ?? str(api.make_label),
    modelName: str((api.model as Api | undefined)?.name) ?? str(api.model_name),
    year: num(api.year, 0),
    carTypeLabel: str((api.car_type as Api | undefined)?.label) ?? str(api.car_type_label),
    seats: num(api.seats, 4),
    ac: typeof api.ac === 'boolean' ? api.ac : true,
  };
}

export function transformDriver(api: Api): Driver {
  const id = reqStr(api.id, 'MISSING_ID', { api });
  return {
    id,
    userId: reqStr(api.user_id, 'MISSING_USER_ID', { id }),
    fullName: str(api.full_name) ?? '',
    phone: str(api.phone) ?? '',
    email: str(api.email),
    homeCity: maybeCity(api.home_city),
    homePlace: maybePlace(api.home_place),
    currentCity: maybeCity(api.current_city),
    currentPlace: maybePlace(api.current_place),
    currentLat: typeof api.current_lat === 'number' ? api.current_lat : undefined,
    currentLng: typeof api.current_lng === 'number' ? api.current_lng : undefined,
    distanceKm: typeof api.distance_km === 'number' ? api.distance_km : undefined,
    profilePhotoUrl: str(api.profile_photo_url) ?? '',
    kycStatus: (str(api.kyc_status) ?? 'pending') as KycStatus,
    ratingAvg: num(api.rating_avg, 0),
    ratingCount: num(api.rating_count, 0),
    ratingDistribution: ratingDist(api.rating_distribution),
    topTags: strArray(api.top_tags),
    managerTopTags: strArray(api.manager_top_tags),
    totalTripsCompleted: num(api.total_trips_completed, 0),
    vehicles: Array.isArray(api.vehicles) ? (api.vehicles as Api[]).map(vehicleSummary) : [],
  };
}

export function transformAgent(api: Api): Agent {
  const id = reqStr(api.id, 'MISSING_ID', { api });
  return {
    id,
    userId: reqStr(api.user_id, 'MISSING_USER_ID', { id }),
    fullName: str(api.full_name) ?? '',
    phone: str(api.phone) ?? '',
    email: str(api.email),
    businessName: str(api.business_name),
    businessCity: maybeCity(api.business_city),
    profilePhotoUrl: str(api.profile_photo_url) ?? '',
    kycStatus: (str(api.kyc_status) ?? 'pending') as KycStatus,
    topTags: strArray(api.top_tags),
    totalTripsPosted: num(api.total_trips_posted, 0),
  };
}

// ── write-side ──────────────────────────────────────────────────────────────
export function toApiUpdateDriver(input: { fullName?: string; email?: string; homeCityId?: string; currentCityId?: string; profilePhotoUrl?: string }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.fullName !== undefined) out.full_name = input.fullName;
  if (input.email !== undefined) out.email = input.email;
  if (input.homeCityId !== undefined) out.home_city_id = input.homeCityId;
  if (input.currentCityId !== undefined) out.current_city_id = input.currentCityId;
  if (input.profilePhotoUrl !== undefined) out.profile_photo_url = input.profilePhotoUrl;
  return out;
}
export function toApiUpdateLocation(input: { cityId?: string; lat?: number; lng?: number }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.cityId !== undefined) out.current_city_id = input.cityId;
  if (input.lat !== undefined) out.current_lat = input.lat;
  if (input.lng !== undefined) out.current_lng = input.lng;
  out.current_location_at = new Date().toISOString();
  return out;
}

/** `POST /drivers` body for a new driver profile (role discriminator + snake_case; drops undefined). */
export function toApiCreateDriverProfile(input: CreateDriverProfileInput): Record<string, unknown> {
  const out: Record<string, unknown> = { role: 'driver', full_name: input.fullName, home_city_id: input.homeCityId };
  if (input.email !== undefined) out.email = input.email;
  return out;
}
/** `POST /drivers` body for a new agent (trip_manager) profile (role discriminator + snake_case; drops undefined). */
export function toApiCreateAgentProfile(input: CreateAgentProfileInput): Record<string, unknown> {
  const out: Record<string, unknown> = { role: 'trip_manager', full_name: input.fullName, business_city_id: input.businessCityId };
  if (input.email !== undefined) out.email = input.email;
  if (input.businessName !== undefined) out.business_name = input.businessName;
  return out;
}
