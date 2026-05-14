/**
 * Transforms for the admin master-data resources — strict (throw on missing
 * required fields) one-way `snake_case` → `camelCase`, plus `toApi*` writers.
 */
import { ApiTransformError } from '@/lib/api/transforms/base';
import type {
  AppSettings,
  AppSettingsInput,
  CancelReasonAppliesTo,
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
  ReviewTagSentiment,
  SeatOptionRow,
  VehicleModelInput,
  VehicleModelRow,
} from '@/types';

export type AdminConfigTransformErrorCode = 'MISSING_ID' | 'MISSING_LABEL' | 'MISSING_FIELD' | 'BAD_VALUE';

export class AdminConfigTransformError extends ApiTransformError<AdminConfigTransformErrorCode> {}

function reqId(api: { id?: unknown }): string {
  if (typeof api?.id !== 'string' || !api.id) throw new AdminConfigTransformError('row has no id', 'MISSING_ID', { api });
  return api.id;
}
function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : fallback;
}
function reqNum(v: unknown, field: string, ctx: Record<string, unknown>): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) throw new AdminConfigTransformError(`row has no ${field}`, 'MISSING_FIELD', ctx);
  return n;
}
function reqStr(v: unknown, field: string, ctx: Record<string, unknown>): string {
  if (typeof v !== 'string' || !v) throw new AdminConfigTransformError(`row has no ${field}`, 'MISSING_FIELD', ctx);
  return v;
}

// ── generic lookup (car_types, fuel_types, vehicle_makes) ───────────────────
// vehicle_makes carries `name`; everything else carries `label`. Normalise to `label`.
export function transformLookup(api: Record<string, unknown>): LookupRow {
  const id = reqId(api);
  const label = (api.label as string) ?? (api.name as string);
  if (typeof label !== 'string' || !label) throw new AdminConfigTransformError('lookup row has no label/name', 'MISSING_LABEL', { id });
  return { id, label, sortOrder: num(api.sort_order, 0), isActive: api.is_active !== false };
}
export function toApiLookup(input: Partial<LookupInput> & { isActive?: boolean }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.label !== undefined) out.label = input.label;
  if (input.sortOrder !== undefined) out.sort_order = input.sortOrder;
  if (input.isActive !== undefined) out.is_active = input.isActive;
  return out;
}
/** vehicle_makes write helper — sends `name` (not `label`). */
export function toApiMake(input: Partial<LookupInput> & { isActive?: boolean }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.label !== undefined) out.name = input.label;
  if (input.sortOrder !== undefined) out.sort_order = input.sortOrder;
  if (input.isActive !== undefined) out.is_active = input.isActive;
  return out;
}

// ── vehicle_models ──────────────────────────────────────────────────────────
export function transformVehicleModel(api: Record<string, unknown>): VehicleModelRow {
  const id = reqId(api);
  return {
    id,
    makeId: reqStr(api.make_id, 'make_id', { id }),
    name: reqStr(api.name, 'name', { id }),
    defaultCarTypeId: typeof api.default_car_type_id === 'string' ? api.default_car_type_id : undefined,
    defaultSeats: typeof api.default_seats === 'number' ? api.default_seats : undefined,
    sortOrder: num(api.sort_order, 0),
    isActive: api.is_active !== false,
  };
}
export function toApiVehicleModel(input: Partial<VehicleModelInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.makeId !== undefined) out.make_id = input.makeId;
  if (input.name !== undefined) out.name = input.name;
  if (input.defaultCarTypeId !== undefined) out.default_car_type_id = input.defaultCarTypeId;
  if (input.defaultSeats !== undefined) out.default_seats = input.defaultSeats;
  if (input.sortOrder !== undefined) out.sort_order = input.sortOrder;
  if (input.isActive !== undefined) out.is_active = input.isActive;
  return out;
}

// ── seat_options ────────────────────────────────────────────────────────────
export function transformSeatOption(api: Record<string, unknown>): SeatOptionRow {
  return { value: reqNum(api.value, 'value', { api }), isActive: api.is_active !== false };
}

// ── cities ──────────────────────────────────────────────────────────────────
export function transformCity(api: Record<string, unknown>): CityRow {
  const id = reqId(api);
  return {
    id,
    name: reqStr(api.name, 'name', { id }),
    state: reqStr(api.state, 'state', { id }),
    lat: reqNum(api.lat, 'lat', { id }),
    lng: reqNum(api.lng, 'lng', { id }),
    sortOrder: num(api.sort_order, 0),
    isActive: api.is_active !== false,
  };
}
export function toApiCity(input: Partial<CityInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.name !== undefined) out.name = input.name;
  if (input.state !== undefined) out.state = input.state;
  if (input.lat !== undefined) out.lat = input.lat;
  if (input.lng !== undefined) out.lng = input.lng;
  if (input.sortOrder !== undefined) out.sort_order = input.sortOrder;
  if (input.isActive !== undefined) out.is_active = input.isActive;
  return out;
}

// ── languages ───────────────────────────────────────────────────────────────
export function transformLanguage(api: Record<string, unknown>): LanguageRow {
  const code = reqStr(api.code, 'code', { api });
  return {
    code,
    nativeName: reqStr(api.native_name, 'native_name', { code }),
    englishName: reqStr(api.english_name, 'english_name', { code }),
    displayOrder: num(api.display_order, 0),
    isActive: api.is_active !== false,
  };
}
export function toApiLanguage(input: Partial<LanguageInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.code !== undefined) out.code = input.code;
  if (input.nativeName !== undefined) out.native_name = input.nativeName;
  if (input.englishName !== undefined) out.english_name = input.englishName;
  if (input.displayOrder !== undefined) out.display_order = input.displayOrder;
  if (input.isActive !== undefined) out.is_active = input.isActive;
  return out;
}

// ── review_tags ─────────────────────────────────────────────────────────────
const REVIEW_TAG_CATEGORIES: readonly ReviewTagCategory[] = ['passenger_to_driver', 'manager_to_driver', 'driver_to_manager'];
const REVIEW_TAG_SENTIMENTS: readonly ReviewTagSentiment[] = ['positive', 'neutral', 'negative'];
export function transformReviewTag(api: Record<string, unknown>): ReviewTagRow {
  const id = reqId(api);
  const category = reqStr(api.category, 'category', { id });
  if (!REVIEW_TAG_CATEGORIES.includes(category as ReviewTagCategory)) throw new AdminConfigTransformError(`bad review-tag category "${category}"`, 'BAD_VALUE', { id, category });
  const sentiment = (typeof api.sentiment === 'string' ? api.sentiment : 'positive') as ReviewTagSentiment;
  return {
    id,
    label: reqStr(api.label, 'label', { id }),
    category: category as ReviewTagCategory,
    sentiment: REVIEW_TAG_SENTIMENTS.includes(sentiment) ? sentiment : 'positive',
    sortOrder: num(api.sort_order, 0),
    isActive: api.is_active !== false,
  };
}
export function toApiReviewTag(input: Partial<ReviewTagInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.label !== undefined) out.label = input.label;
  if (input.category !== undefined) out.category = input.category;
  if (input.sentiment !== undefined) out.sentiment = input.sentiment;
  if (input.sortOrder !== undefined) out.sort_order = input.sortOrder;
  if (input.isActive !== undefined) out.is_active = input.isActive;
  return out;
}

// ── cancel_reasons ──────────────────────────────────────────────────────────
const CANCEL_APPLIES_TO: readonly CancelReasonAppliesTo[] = ['agent', 'driver', 'both'];
export function transformCancelReason(api: Record<string, unknown>): CancelReasonRow {
  const id = reqId(api);
  const appliesTo = reqStr(api.applies_to, 'applies_to', { id });
  if (!CANCEL_APPLIES_TO.includes(appliesTo as CancelReasonAppliesTo)) throw new AdminConfigTransformError(`bad cancel-reason applies_to "${appliesTo}"`, 'BAD_VALUE', { id, appliesTo });
  return {
    id,
    label: reqStr(api.label, 'label', { id }),
    appliesTo: appliesTo as CancelReasonAppliesTo,
    sortOrder: num(api.sort_order, 0),
    isActive: api.is_active !== false,
  };
}
export function toApiCancelReason(input: Partial<CancelReasonInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.label !== undefined) out.label = input.label;
  if (input.appliesTo !== undefined) out.applies_to = input.appliesTo;
  if (input.sortOrder !== undefined) out.sort_order = input.sortOrder;
  if (input.isActive !== undefined) out.is_active = input.isActive;
  return out;
}

// ── app_settings ────────────────────────────────────────────────────────────
export function transformAppSettings(api: Record<string, unknown>): AppSettings {
  return {
    minVehicleYear: reqNum(api.min_vehicle_year, 'min_vehicle_year', { api }),
    vehicleExpiryWarningDays: reqNum(api.vehicle_expiry_warning_days, 'vehicle_expiry_warning_days', { api }),
    defaultAlertRadiusKm: reqNum(api.default_alert_radius_km, 'default_alert_radius_km', { api }),
    defaultCommissionPct: reqNum(api.default_commission_pct, 'default_commission_pct', { api }),
    defaultGstAmount: reqNum(api.default_gst_amount, 'default_gst_amount', { api }),
    defaultDriverBata: reqNum(api.default_driver_bata, 'default_driver_bata', { api }),
    defaultExtrasPaidByPassenger: api.default_extras_paid_by_passenger !== false,
    defaultDriverInstructions: typeof api.default_driver_instructions === 'string' ? api.default_driver_instructions : '',
    maxActiveVacanciesPerDriver: reqNum(api.max_active_vacancies_per_driver, 'max_active_vacancies_per_driver', { api }),
    inviteMaxRadiusKm: reqNum(api.invite_max_radius_km, 'invite_max_radius_km', { api }),
  };
}
export function toApiAppSettings(input: AppSettingsInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.minVehicleYear !== undefined) out.min_vehicle_year = input.minVehicleYear;
  if (input.vehicleExpiryWarningDays !== undefined) out.vehicle_expiry_warning_days = input.vehicleExpiryWarningDays;
  if (input.defaultAlertRadiusKm !== undefined) out.default_alert_radius_km = input.defaultAlertRadiusKm;
  if (input.defaultCommissionPct !== undefined) out.default_commission_pct = input.defaultCommissionPct;
  if (input.defaultGstAmount !== undefined) out.default_gst_amount = input.defaultGstAmount;
  if (input.defaultDriverBata !== undefined) out.default_driver_bata = input.defaultDriverBata;
  if (input.defaultExtrasPaidByPassenger !== undefined) out.default_extras_paid_by_passenger = input.defaultExtrasPaidByPassenger;
  if (input.defaultDriverInstructions !== undefined) out.default_driver_instructions = input.defaultDriverInstructions;
  if (input.maxActiveVacanciesPerDriver !== undefined) out.max_active_vacancies_per_driver = input.maxActiveVacanciesPerDriver;
  if (input.inviteMaxRadiusKm !== undefined) out.invite_max_radius_km = input.inviteMaxRadiusKm;
  return out;
}
