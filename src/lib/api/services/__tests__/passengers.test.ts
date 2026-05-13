import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient, ApiError } from '@/lib/api/client';
import { getPassengers, lookupPassengerByPhone } from '@/lib/api/services/passengers';

function ok<T>(data: T) {
  return Promise.resolve({ success: true, data, error: null } as const);
}
const ROW = { id: 'p1', phone: '+919876543210', name: 'Jane', aliases: [], referred_by_user_id: 'u9', display_handle: 'A1B2C3D', trips_count: 2 };

describe('passengers service', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('getPassengers → GET /passengers (no params), mapped via transformPassenger', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok([ROW]) as never);
    const list = await getPassengers();
    expect(get).toHaveBeenCalledWith('/passengers', undefined);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'p1', phone: '+919876543210', name: 'Jane', tripsCount: 2 });
  });

  it('getPassengers forwards q / sort / page / limit', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok([]) as never);
    await getPassengers({ q: 'jane', sort: 'first_seen_at', page: 2, limit: 50 });
    expect(get).toHaveBeenCalledWith('/passengers', { q: 'jane', sort: 'first_seen_at', page: 2, limit: 50 });
  });

  it('lookupPassengerByPhone → GET /passengers/lookup?phone=, mapped; 404 → null', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok(ROW) as never);
    const p = await lookupPassengerByPhone('+919876543210');
    expect(get).toHaveBeenCalledWith('/passengers/lookup', { phone: '+919876543210' });
    expect(p?.name).toBe('Jane');

    get.mockReturnValue(Promise.reject(new ApiError('not found', 404)) as never);
    expect(await lookupPassengerByPhone('+910000000000')).toBeNull();
  });

  it('lookupPassengerByPhone re-throws non-404 errors', async () => {
    vi.spyOn(apiClient, 'get').mockReturnValue(Promise.reject(new ApiError('server error', 500)) as never);
    await expect(lookupPassengerByPhone('+91')).rejects.toBeInstanceOf(ApiError);
  });
});
