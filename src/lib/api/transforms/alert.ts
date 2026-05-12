/** Alert transforms — strict on id / user_id / from_city; cities joined server-side. */
import { transformCity } from '@/lib/api/transforms/adminConfig';
import type { Alert, AlertInput, CityRow, NotifyChannel } from '@/types';

export type AlertTransformErrorCode = 'MISSING_ID' | 'MISSING_USER_ID' | 'MISSING_FROM_CITY';
export class AlertTransformError extends Error {
  constructor(message: string, public code: AlertTransformErrorCode, public context: Record<string, unknown> = {}) {
    super(message);
    this.name = 'AlertTransformError';
  }
}
type Api = Record<string, unknown>;
const CHANNELS: readonly NotifyChannel[] = ['push', 'sms', 'email', 'in_app'];
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}
function reqStr(v: unknown, code: AlertTransformErrorCode, ctx: Api): string {
  const s = str(v);
  if (!s) throw new AlertTransformError(`missing ${code}`, code, ctx);
  return s;
}
function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
function reqCity(v: unknown, ctx: Api): CityRow {
  if (!v || typeof v !== 'object') throw new AlertTransformError('missing MISSING_FROM_CITY', 'MISSING_FROM_CITY', ctx);
  return transformCity(v as Api);
}

export function transformAlert(api: Api): Alert {
  const id = reqStr(api.id, 'MISSING_ID', { api });
  const ctx = { alert_id: id };
  const channels = (Array.isArray(api.notify_via) ? (api.notify_via as unknown[]) : ['in_app']).filter((c): c is NotifyChannel => typeof c === 'string' && (CHANNELS as readonly string[]).includes(c));
  return {
    id,
    userId: reqStr(api.user_id, 'MISSING_USER_ID', ctx),
    name: str(api.name) ?? '',
    fromCity: reqCity(api.from_city, ctx),
    fromRadiusKm: num(api.from_radius_km) ?? 25,
    toCity: api.to_city && typeof api.to_city === 'object' ? transformCity(api.to_city as Api) : undefined,
    toRadiusKm: num(api.to_radius_km),
    minRatePerKm: num(api.min_rate_per_km),
    minCommissionPct: num(api.min_commission_pct),
    carTypeIds: Array.isArray(api.car_type_ids) ? (api.car_type_ids as unknown[]).filter((x): x is string => typeof x === 'string') : [],
    pickupWindowStart: str(api.pickup_window_start),
    pickupWindowEnd: str(api.pickup_window_end),
    notifyVia: channels.length ? channels : ['in_app'],
    isActive: typeof api.is_active === 'boolean' ? api.is_active : true,
    pausedAt: str(api.paused_at),
    createdAt: str(api.created_at) ?? new Date().toISOString(),
  };
}

export function toApiAlert(input: Partial<AlertInput>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.name !== undefined) out.name = input.name;
  if (input.fromCityId !== undefined) out.from_city_id = input.fromCityId;
  if (input.fromRadiusKm !== undefined) out.from_radius_km = input.fromRadiusKm;
  if (input.toCityId !== undefined) out.to_city_id = input.toCityId;
  if (input.toRadiusKm !== undefined) out.to_radius_km = input.toRadiusKm;
  if (input.minRatePerKm !== undefined) out.min_rate_per_km = input.minRatePerKm;
  if (input.minCommissionPct !== undefined) out.min_commission_pct = input.minCommissionPct;
  if (input.carTypeIds !== undefined) out.car_type_ids = input.carTypeIds;
  if (input.pickupWindowStart !== undefined) out.pickup_window_start = input.pickupWindowStart;
  if (input.pickupWindowEnd !== undefined) out.pickup_window_end = input.pickupWindowEnd;
  if (input.notifyVia !== undefined) out.notify_via = input.notifyVia;
  if (input.isActive !== undefined) out.is_active = input.isActive;
  return out;
}
