/**
 * Passenger transforms — strict on the identity (`id` / `phone` / `name` are
 * always supplied by `GET /passengers` and `/passengers/lookup`), lenient on the
 * provenance fields. One-way snake_case → camelCase; nothing is computed here.
 */
import type { Passenger, PassengerReferrer, UserRole } from '@/types';

export type PassengerTransformErrorCode = 'NOT_OBJECT' | 'MISSING_FIELD';
export class PassengerTransformError extends Error {
  constructor(message: string, public code: PassengerTransformErrorCode, public context: Record<string, unknown> = {}) {
    super(message);
    this.name = 'PassengerTransformError';
  }
}

type Api = Record<string, unknown>;
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}
function reqStr(v: unknown, code: PassengerTransformErrorCode, key: string, ctx: Api): string {
  const s = str(v);
  if (!s) throw new PassengerTransformError(`missing "${key}"`, code, ctx);
  return s;
}
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : fallback;
}
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
}
function referrerOf(v: unknown): PassengerReferrer | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const a = v as Api;
  const id = str(a.id);
  if (!id) return undefined;
  return { id, displayName: str(a.display_name) ?? '', role: ((a.role as string) ?? 'driver') as UserRole, phone: str(a.phone) };
}

export function transformPassenger(api: unknown): Passenger {
  if (!api || typeof api !== 'object' || Array.isArray(api)) throw new PassengerTransformError('passenger is not an object', 'NOT_OBJECT', { value: api });
  const a = api as Api;
  const id = reqStr(a.id, 'MISSING_FIELD', 'id', { api });
  return {
    id,
    phone: reqStr(a.phone, 'MISSING_FIELD', 'phone', { passenger_id: id }),
    name: reqStr(a.name, 'MISSING_FIELD', 'name', { passenger_id: id }),
    aliases: strArray(a.aliases),
    referredByUserId: str(a.referred_by_user_id),
    referredBy: referrerOf(a.referred_by),
    firstTripId: str(a.first_trip_id),
    firstSeenAt: str(a.first_seen_at),
    tripsCount: num(a.trips_count, 0),
    createdAt: str(a.created_at),
    updatedAt: str(a.updated_at),
  };
}
