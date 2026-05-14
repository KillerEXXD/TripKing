import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '@/lib/api/client';
import { createMyAgentProfile, createMyDriverProfile, getAgents, getDriver, getMyAgent, getMyDriver, updateAgentKyc, updateDriverKyc, updateDriverLocation } from '@/lib/api/services/drivers';

function ok<T>(data: T) {
  return Promise.resolve({ success: true, data, error: null } as const);
}

describe('drivers service', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('createMyDriverProfile → POST /drivers with role:driver + snake_case body, mapped via transformDriver', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockReturnValue(ok({ id: 'd1', user_id: 'u1', display_handle: 'A1B2C3D', can_report_bugs: false, full_name: 'Ravi Kumar', phone: '+919999999999', kyc_status: 'pending' }) as never);
    const driver = await createMyDriverProfile({ fullName: 'Ravi Kumar', homeCityId: 'c1', email: 'r@x.com' });
    expect(post).toHaveBeenCalledWith('/drivers', { role: 'driver', full_name: 'Ravi Kumar', home_city_id: 'c1', email: 'r@x.com' });
    expect(driver.id).toBe('d1');
    expect(driver.fullName).toBe('Ravi Kumar');
    expect(driver.kycStatus).toBe('pending');
  });

  it('createMyDriverProfile omits email when not supplied', async () => {
    const post = vi.spyOn(apiClient, 'post').mockReturnValue(ok({ id: 'd2', user_id: 'u2', display_handle: 'A1B2C3D', can_report_bugs: false, }) as never);
    await createMyDriverProfile({ fullName: 'No Email', homeCityId: 'c3' });
    expect(post).toHaveBeenCalledWith('/drivers', { role: 'driver', full_name: 'No Email', home_city_id: 'c3' });
  });

  it('createMyAgentProfile → POST /drivers with role:trip_manager + business_city_id, mapped via transformAgent', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockReturnValue(ok({ id: 'a1', user_id: 'u3', display_handle: 'A1B2C3D', can_report_bugs: false, full_name: 'Agent A', phone: '+91', business_name: 'A Travels', kyc_status: 'pending' }) as never);
    const agent = await createMyAgentProfile({ fullName: 'Agent A', businessCityId: 'c1', businessName: 'A Travels' });
    expect(post).toHaveBeenCalledWith('/drivers', { role: 'trip_manager', full_name: 'Agent A', business_city_id: 'c1', business_name: 'A Travels' });
    expect(agent.id).toBe('a1');
    expect(agent.businessName).toBe('A Travels');
  });

  it('getDriver → GET /drivers/:id', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok({ id: 'd9', user_id: 'u9', display_handle: 'A1B2C3D', can_report_bugs: false, }) as never);
    const driver = await getDriver('d9');
    expect(get).toHaveBeenCalledWith('/drivers/d9');
    expect(driver.id).toBe('d9');
  });

  it('getMyDriver → GET /drivers/me', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok({ id: 'd1', user_id: 'u1', display_handle: 'A1B2C3D', can_report_bugs: false, full_name: 'Me' }) as never);
    const d = await getMyDriver();
    expect(get).toHaveBeenCalledWith('/drivers/me');
    expect(d.fullName).toBe('Me');
  });

  it('getMyAgent → GET /agents/me', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok({ id: 'a1', user_id: 'u1', display_handle: 'A1B2C3D', can_report_bugs: false, full_name: 'Me Agent', business_name: 'My Travels' }) as never);
    const a = await getMyAgent();
    expect(get).toHaveBeenCalledWith('/agents/me');
    expect(a.businessName).toBe('My Travels');
  });

  it('getAgents({ kycStatus }) → GET /agents?kyc_status=', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok([{ id: 'a1', user_id: 'u1', display_handle: 'A1B2C3D', can_report_bugs: false, kyc_status: 'docs_submitted' }]) as never);
    const agents = await getAgents({ kycStatus: 'docs_submitted' });
    expect(get).toHaveBeenCalledWith('/agents', { kyc_status: 'docs_submitted' });
    expect(agents[0]?.id).toBe('a1');
  });

  it('updateDriverKyc → PATCH /drivers/:id/kyc { kyc_status, note? }', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockReturnValue(ok({ id: 'd1', user_id: 'u1', display_handle: 'A1B2C3D', can_report_bugs: false, kyc_status: 'approved' }) as never);
    const driver = await updateDriverKyc('d1', 'approved');
    expect(patch).toHaveBeenCalledWith('/drivers/d1/kyc', { kyc_status: 'approved' });
    expect(driver.kycStatus).toBe('approved');
    await updateDriverKyc('d1', 'rejected', 'docs unclear');
    expect(patch).toHaveBeenLastCalledWith('/drivers/d1/kyc', { kyc_status: 'rejected', note: 'docs unclear' });
  });

  it('updateAgentKyc → PATCH /agents/:id/kyc', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockReturnValue(ok({ id: 'a1', user_id: 'u1', display_handle: 'A1B2C3D', can_report_bugs: false, kyc_status: 'approved' }) as never);
    const agent = await updateAgentKyc('a1', 'approved');
    expect(patch).toHaveBeenCalledWith('/agents/a1/kyc', { kyc_status: 'approved' });
    expect(agent.kycStatus).toBe('approved');
  });

  it('updateDriverLocation → PATCH /drivers/:id/location with snake_case lat/lng + a last-seen timestamp', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockReturnValue(ok({ id: 'd1', user_id: 'u1', display_handle: 'A1B2C3D', can_report_bugs: false, current_lat: 13.05, current_lng: 80.2 }) as never);
    const driver = await updateDriverLocation('d1', { lat: 13.05, lng: 80.2 });
    expect(patch).toHaveBeenCalledTimes(1);
    const [path, body] = patch.mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe('/drivers/d1/location');
    expect(body).toMatchObject({ current_lat: 13.05, current_lng: 80.2 });
    expect(typeof body.current_location_at).toBe('string');
    expect(driver.currentLat).toBe(13.05);
    expect(driver.currentLng).toBe(80.2);
  });

  it('updateDriverLocation includes current_city_id when a cityId is supplied', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockReturnValue(ok({ id: 'd1', user_id: 'u1', display_handle: 'A1B2C3D', can_report_bugs: false, }) as never);
    await updateDriverLocation('d1', { cityId: 'c1', lat: 1, lng: 2 });
    expect(patch.mock.calls[0]?.[1]).toMatchObject({ current_city_id: 'c1', current_lat: 1, current_lng: 2 });
  });
});
