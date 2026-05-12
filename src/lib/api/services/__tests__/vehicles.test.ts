import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '@/lib/api/client';
import { getAdminVehicles, getDriverVehicles } from '@/lib/api/services/vehicles';

function ok<T>(data: T) {
  return Promise.resolve({ success: true, data, error: null } as const);
}
const apiVehicle = (over: Record<string, unknown> = {}) => ({ id: 'v1', driver_id: 'd1', year: 2014, car_type_id: 'ct1', seats: 4, ac: true, eligibility_status: 'expired', ...over });

describe('vehicles service', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('getDriverVehicles → GET /vehicles?driver_id=', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok([apiVehicle({ eligibility_status: 'eligible', year: 2022 })]) as never);
    const v = await getDriverVehicles('d1');
    expect(get).toHaveBeenCalledWith('/vehicles', { driver_id: 'd1' });
    expect(v[0]?.eligibilityStatus).toBe('eligible');
  });

  it('getAdminVehicles({ needsAttention }) → GET /vehicles?needs_attention=true', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok([apiVehicle()]) as never);
    const v = await getAdminVehicles({ needsAttention: true });
    expect(get).toHaveBeenCalledWith('/vehicles', { needs_attention: true });
    expect(v[0]?.eligibilityStatus).toBe('expired');
  });

  it('getAdminVehicles({ eligibility }) → GET /vehicles?eligibility=<csv>', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok([apiVehicle({ eligibility_status: 'expiring_soon' })]) as never);
    await getAdminVehicles({ eligibility: ['expiring_soon', 'expired'], includeInactive: true });
    expect(get).toHaveBeenCalledWith('/vehicles', { eligibility: 'expiring_soon,expired', include_inactive: true });
  });
});
