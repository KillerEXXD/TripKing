/** Vacancy-invitations service — the `/vacancy-invitations/*` edge function (PII step 3). */
import { apiClient, EmptyResponseError } from '@/lib/api/client';
import { toApiCreateVacancyInvitation, transformVacancyInvitation } from '@/lib/api/transforms/vacancyInvitations';
import type { CreateVacancyInvitationInput, VacancyInvitation, VacancyInvitationsQueryParams } from '@/types';

type Api = Record<string, unknown>;
function unwrap<T>(d: T | null): T {
  if (d === null || d === undefined) throw new EmptyResponseError('vacancy-invitations');
  return d;
}

export function getVacancyInvitations(params: VacancyInvitationsQueryParams = {}): Promise<VacancyInvitation[]> {
  const q: Record<string, string> = {};
  if (params.role) q.role = params.role;
  return apiClient.get<Api[]>('/vacancy-invitations', q).then((r) => (r.data ?? []).map(transformVacancyInvitation));
}

export function getVacancyInvitation(id: string): Promise<VacancyInvitation> {
  return apiClient.get<Api>(`/vacancy-invitations/${id}`).then((r) => transformVacancyInvitation(unwrap(r.data)));
}

export function createVacancyInvitation(input: CreateVacancyInvitationInput): Promise<VacancyInvitation> {
  return apiClient.post<Api>('/vacancy-invitations', toApiCreateVacancyInvitation(input)).then((r) => transformVacancyInvitation(unwrap(r.data)));
}

export function decideVacancyInvitation(id: string, status: 'accepted' | 'declined'): Promise<VacancyInvitation> {
  return apiClient.patch<Api>(`/vacancy-invitations/${id}`, { status }).then((r) => transformVacancyInvitation(unwrap(r.data)));
}
