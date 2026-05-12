/** Vacancies service — driver availability posts. (The `/vacancies/*` edge functions land later.) */
import { apiClient } from '@/lib/api/client';
import { toApiPostVacancy, transformVacancy } from '@/lib/api/transforms/vacancy';
import type { PostVacancyInput, Vacancy, VacanciesQueryParams } from '@/types';

type Api = Record<string, unknown>;
function unwrap<T>(d: T | null): T {
  if (d === null || d === undefined) throw new Error('vacancies: empty response body');
  return d;
}

export function getVacancies(params?: VacanciesQueryParams): Promise<Vacancy[]> {
  const q: Record<string, unknown> = {};
  if (params?.currentCityId) q.current_city_id = params.currentCityId;
  if (params?.destinationCityId) q.destination_city_id = params.destinationCityId;
  if (params?.status) q.status = params.status;
  if (params?.driverId) q.driver_id = params.driverId;
  if (params?.page) q.page = params.page;
  if (params?.limit) q.limit = params.limit;
  if (params?.sort) q.sort = params.sort;
  return apiClient.get<Api[]>('/vacancies', Object.keys(q).length ? q : undefined).then((r) => (r.data ?? []).map(transformVacancy));
}
export function getVacancy(id: string): Promise<Vacancy> {
  return apiClient.get<Api>(`/vacancies/${id}`).then((r) => transformVacancy(unwrap(r.data)));
}
export function postVacancy(input: PostVacancyInput): Promise<Vacancy> {
  return apiClient.post<Api>('/vacancies', toApiPostVacancy(input)).then((r) => transformVacancy(unwrap(r.data)));
}
export function cancelVacancy(id: string): Promise<Vacancy> {
  return apiClient.post<Api>(`/vacancies/${id}/cancel`, {}).then((r) => transformVacancy(unwrap(r.data)));
}
