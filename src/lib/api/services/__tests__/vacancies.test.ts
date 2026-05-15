import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient, EmptyResponseError } from '@/lib/api/client';
import * as transforms from '@/lib/api/transforms/vacancy';
import { cancelVacancy, getVacancies, getVacancy, patchVacancy, postVacancy } from '@/lib/api/services/vacancies';

function ok<T>(data: T) {
  return Promise.resolve({ success: true, data, error: null } as const);
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(transforms, 'transformVacancy').mockImplementation((row: unknown) => ({ id: (row as { id: string }).id } as never));
  vi.spyOn(transforms, 'toApiPostVacancy').mockImplementation(() => ({ stub: true }) as never);
});

describe('vacancies service', () => {
  it('getVacancies → GET /vacancies with snake_case query params', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok([{ id: 'v1' }]) as never);
    await getVacancies({ currentCityId: 'c1', destinationCityId: 'c2', destinationPlaceId: 'p1', status: 'active', driverId: 'd1', near: { lat: 13, lng: 80, radiusKm: 25 }, page: 1, limit: 20, sort: 'recent' });
    expect(get).toHaveBeenCalledWith('/vacancies', { current_city_id: 'c1', destination_city_id: 'c2', destination_place_id: 'p1', status: 'active', driver_id: 'd1', near_lat: 13, near_lng: 80, radius_km: 25, page: 1, limit: 20, sort: 'recent' });
  });

  it('getVacancies omits the query object entirely when no params', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok([]) as never);
    await getVacancies();
    expect(get).toHaveBeenCalledWith('/vacancies', undefined);
  });

  it('getVacancy → GET /vacancies/:id, throws EmptyResponseError on null body', async () => {
    vi.spyOn(apiClient, 'get').mockReturnValue(ok(null) as never);
    await expect(getVacancy('v1')).rejects.toBeInstanceOf(EmptyResponseError);
  });

  it('postVacancy → POST /vacancies with the toApiPostVacancy body', async () => {
    const post = vi.spyOn(apiClient, 'post').mockReturnValue(ok({ id: 'v1' }) as never);
    await postVacancy({} as never);
    expect(post).toHaveBeenCalledWith('/vacancies', { stub: true });
  });

  it('patchVacancy → PATCH /vacancies/:id with the toApiPostVacancy body', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockReturnValue(ok({ id: 'v1' }) as never);
    await patchVacancy('v1', { notes: 'edited' } as never);
    expect(patch).toHaveBeenCalledWith('/vacancies/v1', { stub: true });
  });

  it('cancelVacancy → POST /vacancies/:id/cancel with an empty body', async () => {
    const post = vi.spyOn(apiClient, 'post').mockReturnValue(ok({ id: 'v1' }) as never);
    await cancelVacancy('v1');
    expect(post).toHaveBeenCalledWith('/vacancies/v1/cancel', {});
  });
});
