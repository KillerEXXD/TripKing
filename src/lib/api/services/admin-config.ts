/**
 * Admin master-data API — the `/admin/*` resources (see §7).
 *
 * One typed `makeResource` factory drives the uniform lookup tables; the
 * irregular ones (`seat_options`, filtered model/tag lists, `app_settings`)
 * get their own thin functions. Every call goes through `apiClient`; transforms
 * validate strictly.
 */
import { apiClient } from '@/lib/api/client';
import {
  toApiCancelReason,
  toApiCity,
  toApiLanguage,
  toApiLookup,
  toApiMake,
  toApiReviewTag,
  toApiVehicleModel,
  toApiAppSettings,
  transformAppSettings,
  transformCancelReason,
  transformCity,
  transformLanguage,
  transformLookup,
  transformReviewTag,
  transformSeatOption,
  transformVehicleModel,
} from '@/lib/api/transforms/adminConfig';
import type {
  AppSettings,
  AppSettingsInput,
  CancelReasonInput,
  CancelReasonRow,
  CityInput,
  CityRow,
  LanguageInput,
  LanguageRow,
  LookupInput,
  LookupRow,
  ReviewTagCategory,
  ReviewTagInput,
  ReviewTagRow,
  SeatOptionRow,
  VehicleModelInput,
  VehicleModelRow,
} from '@/types';

type ApiRow = Record<string, unknown>;

function unwrap<T>(data: T | null): T {
  if (data === null || data === undefined) throw new Error('admin-config: empty response body');
  return data;
}

export interface ResourceApi<TRow, TInput> {
  list(opts?: { includeInactive?: boolean }): Promise<TRow[]>;
  create(input: TInput): Promise<TRow>;
  update(id: string, patch: Partial<TInput>): Promise<TRow>;
  setActive(id: string, isActive: boolean): Promise<TRow>;
  remove(id: string): Promise<void>;
  /** Set `sort_order` from the given id ordering. */
  reorder(ids: string[]): Promise<void>;
}

function makeResource<TRow, TInput>(
  path: string,
  transform: (api: ApiRow) => TRow,
  toApi: (input: Partial<TInput> & { isActive?: boolean }) => ApiRow,
): ResourceApi<TRow, TInput> {
  return {
    list: (opts) =>
      apiClient
        .get<ApiRow[]>(`/admin/${path}`, opts?.includeInactive ? { include_inactive: true } : undefined)
        .then((r) => (r.data ?? []).map(transform)),
    create: (input) => apiClient.post<ApiRow>(`/admin/${path}`, toApi(input as Partial<TInput>)).then((r) => transform(unwrap(r.data))),
    update: (id, patch) => apiClient.patch<ApiRow>(`/admin/${path}/${id}`, toApi(patch)).then((r) => transform(unwrap(r.data))),
    setActive: (id, isActive) => apiClient.patch<ApiRow>(`/admin/${path}/${id}`, { is_active: isActive }).then((r) => transform(unwrap(r.data))),
    remove: (id) => apiClient.delete<unknown>(`/admin/${path}/${id}`).then(() => undefined),
    reorder: (ids) => apiClient.patch<unknown>(`/admin/${path}/reorder`, { ids }).then(() => undefined),
  };
}

export const carTypesApi = makeResource<LookupRow, LookupInput>('car-types', transformLookup, toApiLookup);
export const fuelTypesApi = makeResource<LookupRow, LookupInput>('fuel-types', transformLookup, toApiLookup);
export const vehicleMakesApi = makeResource<LookupRow, LookupInput>('vehicle-makes', transformLookup, toApiMake);
export const vehicleModelsApi = makeResource<VehicleModelRow, VehicleModelInput>('vehicle-models', transformVehicleModel, toApiVehicleModel);
export const citiesApi = makeResource<CityRow, CityInput>('cities', transformCity, toApiCity);
export const languagesApi = makeResource<LanguageRow, LanguageInput>('languages', transformLanguage, toApiLanguage);
export const reviewTagsApi = makeResource<ReviewTagRow, ReviewTagInput>('review-tags', transformReviewTag, toApiReviewTag);
export const cancelReasonsApi = makeResource<CancelReasonRow, CancelReasonInput>('cancel-reasons', transformCancelReason, toApiCancelReason);

/** Vehicle models for one make (the model dropdown is filtered by the selected make). */
export const getVehicleModelsForMake = (makeId: string, opts?: { includeInactive?: boolean }): Promise<VehicleModelRow[]> =>
  apiClient
    .get<ApiRow[]>('/admin/vehicle-models', { make_id: makeId, include_inactive: opts?.includeInactive || undefined })
    .then((r) => (r.data ?? []).map(transformVehicleModel));

/** Review tags for one vocabulary (`passenger_to_driver` | `manager_to_driver` | `driver_to_manager`). */
export const getReviewTagsByCategory = (category: ReviewTagCategory, opts?: { includeInactive?: boolean }): Promise<ReviewTagRow[]> =>
  apiClient
    .get<ApiRow[]>('/admin/review-tags', { category, include_inactive: opts?.includeInactive || undefined })
    .then((r) => (r.data ?? []).map(transformReviewTag));

/** `seat_options` is keyed by `value` (an int), so it gets its own minimal API. */
export const seatOptionsApi = {
  list: (opts?: { includeInactive?: boolean }): Promise<SeatOptionRow[]> =>
    apiClient
      .get<ApiRow[]>('/admin/seat-options', opts?.includeInactive ? { include_inactive: true } : undefined)
      .then((r) => (r.data ?? []).map(transformSeatOption)),
  create: (value: number): Promise<SeatOptionRow> => apiClient.post<ApiRow>('/admin/seat-options', { value }).then((r) => transformSeatOption(unwrap(r.data))),
  setActive: (value: number, isActive: boolean): Promise<SeatOptionRow> =>
    apiClient.patch<ApiRow>(`/admin/seat-options/${value}`, { is_active: isActive }).then((r) => transformSeatOption(unwrap(r.data))),
  remove: (value: number): Promise<void> => apiClient.delete<unknown>(`/admin/seat-options/${value}`).then(() => undefined),
};

/** Single-row platform config. */
export const getAppSettings = (): Promise<AppSettings> => apiClient.get<ApiRow>('/admin/app-settings').then((r) => transformAppSettings(unwrap(r.data)));
export const updateAppSettings = (patch: AppSettingsInput): Promise<AppSettings> =>
  apiClient.put<ApiRow>('/admin/app-settings', toApiAppSettings(patch)).then((r) => transformAppSettings(unwrap(r.data)));
