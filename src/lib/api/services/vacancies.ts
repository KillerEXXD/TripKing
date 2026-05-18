/** Vacancies service — driver availability posts. (The `/vacancies/*` edge functions land later.) */
import { apiClient, EmptyResponseError } from '@/lib/api/client';
import { toApiPostVacancy, transformVacancy } from '@/lib/api/transforms/vacancy';
import type { PostVacancyInput, Vacancy, VacanciesQueryParams } from '@/types';

type Api = Record<string, unknown>;
function unwrap<T>(d: T | null): T {
  if (d === null || d === undefined) throw new EmptyResponseError('vacancies');
  return d;
}

export function getVacancies(params?: VacanciesQueryParams): Promise<Vacancy[]> {
  const q: Record<string, unknown> = {};
  if (params?.currentCityId) q.current_city_id = params.currentCityId;
  if (params?.destinationCityId) q.destination_city_id = params.destinationCityId;
  if (params?.destinationPlaceId) q.destination_place_id = params.destinationPlaceId;
  if (params?.status) q.status = Array.isArray(params.status) ? params.status.join(',') : params.status;
  if (params?.driverId) q.driver_id = params.driverId;
  if (params?.near) {
    q.near_lat = params.near.lat;
    q.near_lng = params.near.lng;
    q.radius_km = params.near.radiusKm;
  }
  if (params?.page) q.page = params.page;
  if (params?.limit) q.limit = params.limit;
  if (params?.offset != null && params.offset > 0) q.offset = params.offset;
  if (params?.sort) q.sort = params.sort;
  return apiClient.get<Api[]>('/vacancies', Object.keys(q).length ? q : undefined).then((r) => (r.data ?? []).map(transformVacancy));
}
/** Paginated variant for `useInfiniteVacancies`. Returns the page + a `hasMore` hint
 *  inferred from `items.length === limit` (the backend doesn't echo a total — keeps the
 *  list endpoint cheap). When `hasMore` is true, the next page starts at `offset + limit`. */
export function getVacanciesPage(params: Omit<VacanciesQueryParams, 'offset' | 'limit'>, offset: number, limit: number): Promise<{ items: Vacancy[]; hasMore: boolean; nextOffset: number }> {
  return getVacancies({ ...params, offset, limit }).then((items) => ({
    items,
    hasMore: items.length === limit,
    nextOffset: offset + items.length,
  }));
}

export function getVacancy(id: string): Promise<Vacancy> {
  return apiClient.get<Api>(`/vacancies/${id}`).then((r) => transformVacancy(unwrap(r.data)));
}
export function postVacancy(input: PostVacancyInput): Promise<Vacancy> {
  return apiClient.post<Api>('/vacancies', toApiPostVacancy(input)).then((r) => transformVacancy(unwrap(r.data)));
}
export function patchVacancy(id: string, input: Partial<PostVacancyInput>): Promise<Vacancy> {
  return apiClient.patch<Api>(`/vacancies/${id}`, toApiPostVacancy(input as PostVacancyInput)).then((r) => transformVacancy(unwrap(r.data)));
}
export function cancelVacancy(id: string): Promise<Vacancy> {
  return apiClient.post<Api>(`/vacancies/${id}/cancel`, {}).then((r) => transformVacancy(unwrap(r.data)));
}
