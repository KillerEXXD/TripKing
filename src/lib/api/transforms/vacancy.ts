/** Vacancy transforms — strict on id / driver_id / current_city; driver+vehicle+cities+places joined server-side. */
import { ApiTransformError } from '@/lib/api/transforms/base';
import { transformCity } from '@/lib/api/transforms/adminConfig';
import { maybePlace } from '@/lib/api/transforms/place';
import type { CityRow, DriverSummary, Place, PostVacancyInput, Vacancy, VacancyLinkedTrip, VacancyStatus, VehicleSummary } from '@/types';

export type VacancyTransformErrorCode = 'MISSING_ID' | 'MISSING_DRIVER_ID' | 'MISSING_CURRENT_CITY' | 'UNKNOWN_STATUS';
export class VacancyTransformError extends ApiTransformError<VacancyTransformErrorCode> {}

const VACANCY_STATUSES: readonly VacancyStatus[] = ['active', 'matched', 'on_trip', 'expired', 'cancelled'];
function asStatus(raw: unknown, ctx: Record<string, unknown>): VacancyStatus {
  const s = typeof raw === 'string' ? raw : '';
  if (!s) return 'active';
  if (!VACANCY_STATUSES.includes(s as VacancyStatus)) {
    throw new VacancyTransformError(`UNKNOWN_STATUS "${s}"`, 'UNKNOWN_STATUS', { ...ctx, status: s });
  }
  return s as VacancyStatus;
}
function maybeLinkedTrip(raw: unknown): VacancyLinkedTrip | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id : '';
  const pickupAt = typeof o.pickup_at === 'string' ? o.pickup_at : '';
  if (!id || !pickupAt) return undefined;
  const from = o.from_city as Record<string, unknown> | null | undefined;
  const to = o.to_city as Record<string, unknown> | null | undefined;
  return {
    id,
    pickupAt,
    fromCityName: typeof from?.name === 'string' ? from.name : undefined,
    toCityName: typeof to?.name === 'string' ? to.name : undefined,
  };
}
type Api = Record<string, unknown>;
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}
function reqStr(v: unknown, code: VacancyTransformErrorCode, ctx: Api): string {
  const s = str(v);
  if (!s) throw new VacancyTransformError(`missing ${code}`, code, ctx);
  return s;
}
function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
function reqCity(v: unknown, ctx: Api): CityRow {
  if (!v || typeof v !== 'object') throw new VacancyTransformError('missing MISSING_CURRENT_CITY', 'MISSING_CURRENT_CITY', ctx);
  return transformCity(v as Api);
}
/** A vacancy's joined driver is always pre-reveal — fullName / profilePhotoUrl are absent by design. */
function driverSummary(api: Api): DriverSummary {
  return {
    id: str(api.id) ?? '',
    userId: str(api.user_id) ?? '',
    displayHandle: str(api.display_handle) ?? '',
    fullName: str(api.full_name),
    profilePhotoUrl: str(api.profile_photo_url),
    ratingAvg: num(api.rating_avg) ?? 0,
    ratingCount: num(api.rating_count) ?? 0,
    totalTripsCompleted: num(api.total_trips_completed) ?? 0,
    topTags: Array.isArray(api.top_tags) ? (api.top_tags as string[]) : [],
    currentCity: api.current_city && typeof api.current_city === 'object' ? transformCity(api.current_city as Api) : undefined,
    // Optional — only set if the server populates it (used by <VerifiedBadge> on VacancyCard).
    kycStatus: typeof api.kyc_status === 'string' ? (api.kyc_status as DriverSummary['kycStatus']) : undefined,
  };
}
function vehicleSummary(api: Api): VehicleSummary {
  return {
    id: str(api.id) ?? '',
    makeLabel: str((api.make as Api | undefined)?.name) ?? str(api.make_label),
    modelName: str((api.model as Api | undefined)?.name) ?? str(api.model_name),
    year: num(api.year) ?? 0,
    carTypeLabel: str((api.car_type as Api | undefined)?.label) ?? str(api.car_type_label),
    seats: num(api.seats) ?? 4,
    ac: typeof api.ac === 'boolean' ? api.ac : true,
  };
}

export function transformVacancy(api: Api): Vacancy {
  const id = reqStr(api.id, 'MISSING_ID', { api });
  const ctx = { vacancy_id: id };
  const junction = Array.isArray(api.vacancy_destinations) ? (api.vacancy_destinations as Api[]) : [];
  const destinationCities = (
    Array.isArray(api.destination_cities)
      ? (api.destination_cities as unknown[]).map((c) => (c && typeof c === 'object' ? transformCity(c as Api) : null))
      : junction.map((vd) => (vd.city && typeof vd.city === 'object' ? transformCity(vd.city as Api) : null))
  ).filter((c): c is CityRow => c !== null);
  const destinationPlaces = (
    Array.isArray(api.destination_places)
      ? (api.destination_places as unknown[]).map(maybePlace)
      : junction.map((vd) => maybePlace(vd.place))
  ).filter((p): p is Place => p !== undefined);
  return {
    id,
    driverId: reqStr(api.driver_id, 'MISSING_DRIVER_ID', ctx),
    driver: api.driver && typeof api.driver === 'object' ? driverSummary(api.driver as Api) : undefined,
    vehicleId: str(api.vehicle_id),
    vehicle: api.vehicle && typeof api.vehicle === 'object' ? vehicleSummary(api.vehicle as Api) : undefined,
    currentCity: reqCity(api.current_city, ctx),
    currentPlace: maybePlace(api.current_place),
    availableFrom: str(api.available_from) ?? str(api.created_at) ?? new Date().toISOString(),
    availableUntil: str(api.available_until),
    destinationCities,
    destinationPlaces,
    minRatePerKm: num(api.min_rate_per_km),
    notes: str(api.notes),
    status: asStatus(api.status, ctx),
    cancelledAt: str(api.cancelled_at),
    createdAt: str(api.created_at) ?? new Date().toISOString(),
    distanceKm: num(api.distance_km),
    linkedTripId: str(api.linked_trip_id),
    linkedTrip: maybeLinkedTrip(api.linked_trip),
  };
}

export function toApiPostVacancy(input: PostVacancyInput): Record<string, unknown> {
  return {
    vehicle_id: input.vehicleId ?? null,
    current_city_id: input.currentCityId,
    current_place_id: input.currentPlaceId ?? null,
    available_from: input.availableFrom,
    available_until: input.availableUntil ?? null,
    // the unified list is preferred server-side; the parallel arrays stay as a fallback.
    destinations: input.destinations && input.destinations.length > 0 ? input.destinations.map((d) => ({ cityId: d.cityId ?? null, placeId: d.placeId ?? null })) : null,
    destination_city_ids: input.destinationCityIds,
    destination_place_ids: input.destinationPlaceIds ?? null,
    min_rate_per_km: input.minRatePerKm ?? null,
    notes: input.notes ?? null,
  };
}
