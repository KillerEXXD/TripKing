/** Vacancy-invitations transforms — strict on id / vacancy_id / trip_id; joined driver always pre-reveal. */
import { ApiTransformError } from '@/lib/api/transforms/base';
import { transformCity } from '@/lib/api/transforms/adminConfig';
import { transformDriverSummary } from '@/lib/api/transforms/trip';
import type {
  CityRow, CreateVacancyInvitationInput, VacancyInvitation, VacancyInvitationStatus, VacancyStatus,
} from '@/types';

export type VacancyInvitationTransformErrorCode = 'MISSING_ID' | 'MISSING_VACANCY_ID' | 'MISSING_TRIP_ID' | 'MISSING_FIELD';
export class VacancyInvitationTransformError extends ApiTransformError<VacancyInvitationTransformErrorCode> {}

type Api = Record<string, unknown>;
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}
function reqStr(v: unknown, code: VacancyInvitationTransformErrorCode, ctx: Api): string {
  const s = str(v);
  if (!s) throw new VacancyInvitationTransformError(`missing ${code}`, code, ctx);
  return s;
}
function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}
function maybeCity(v: unknown): CityRow | undefined {
  return v && typeof v === 'object' ? transformCity(v as Api) : undefined;
}

const STATUSES: VacancyInvitationStatus[] = ['pending', 'accepted', 'declined', 'expired'];
function statusOf(v: unknown): VacancyInvitationStatus {
  return typeof v === 'string' && (STATUSES as string[]).includes(v) ? (v as VacancyInvitationStatus) : 'pending';
}

export function transformVacancyInvitation(api: Api): VacancyInvitation {
  const id = reqStr(api.id, 'MISSING_ID', { api });
  const ctx = { invitation_id: id };
  const trip = api.trip && typeof api.trip === 'object' ? (api.trip as Api) : null;
  const vacancy = api.vacancy && typeof api.vacancy === 'object' ? (api.vacancy as Api) : null;
  const driver = api.driver && typeof api.driver === 'object' ? (api.driver as Api) : null;
  return {
    id,
    vacancyId: reqStr(api.vacancy_id, 'MISSING_VACANCY_ID', ctx),
    tripId: reqStr(api.trip_id, 'MISSING_TRIP_ID', ctx),
    invitedByUserId: reqStr(api.invited_by_user_id, 'MISSING_FIELD', ctx),
    inviterHandle: str(api.inviter_handle) ?? '',
    inviterName: str(api.inviter_name),
    driverId: reqStr(api.driver_id, 'MISSING_FIELD', ctx),
    driver: driver ? transformDriverSummary(driver, ctx) : undefined,
    status: statusOf(api.status),
    message: str(api.message),
    expiresAt: str(api.expires_at) ?? '',
    decidedAt: str(api.decided_at),
    createdAt: str(api.created_at) ?? new Date().toISOString(),
    trip: trip
      ? {
          id: str(trip.id) ?? '',
          status: str(trip.status) ?? '',
          pickupAt: str(trip.pickup_at) ?? '',
          expectedDistanceKm: num(trip.expected_distance_km),
          totalFare: num(trip.total_fare),
          driverPayout: num(trip.driver_payout),
          fromCity: maybeCity(trip.from_city),
          toCity: maybeCity(trip.to_city),
        }
      : undefined,
    vacancy: vacancy
      ? {
          id: str(vacancy.id) ?? '',
          status: (str(vacancy.status) ?? 'active') as VacancyStatus,
          currentCity: maybeCity(vacancy.current_city),
        }
      : undefined,
  };
}

export function toApiCreateVacancyInvitation(input: CreateVacancyInvitationInput): Record<string, unknown> {
  const out: Record<string, unknown> = { vacancy_id: input.vacancyId, trip_id: input.tripId };
  if (input.message !== undefined) out.message = input.message;
  return out;
}
