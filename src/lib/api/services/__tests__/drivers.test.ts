import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '@/lib/api/client';
import { createMyAgentProfile, createMyDriverProfile, getAgents, getDriver, updateAgentKyc, updateDriverKyc } from '@/lib/api/services/drivers';

function ok<T>(data: T) {
  return Promise.resolve({ success: true, data, error: null } as const);
}

describe('drivers service', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('createMyDriverProfile → POST /drivers with role:driver + snake_case body, mapped via transformDriver', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockReturnValue(ok({ id: 'd1', user_id: 'u1', full_name: 'Ravi Kumar', phone: '+919999999999', kyc_status: 'pending' }) as never);
    const driver = await createMyDriverProfile({ fullName: 'Ravi Kumar', homeCityId: 'c1', email: 'r@x.com' });
    expect(post).toHaveBeenCalledWith('/drivers', { role: 'driver', full_name: 'Ravi Kumar', home_city_id: 'c1', email: 'r@x.com' });
    expect(driver.id).toBe('d1');
    expect(driver.fullName).toBe('Ravi Kumar');
    expect(driver.kycStatus).toBe('pending');
  });

  it('createMyDriverProfile omits email when not supplied', async () => {
    const post = vi.spyOn(apiClient, 'post').mockReturnValue(ok({ id: 'd2', user_id: 'u2' }) as never);
    await createMyDriverProfile({ fullName: 'No Email', homeCityId: 'c3' });
    expect(post).toHaveBeenCalledWith('/drivers', { role: 'driver', full_name: 'No Email', home_city_id: 'c3' });
  });

  it('createMyAgentProfile → POST /drivers with role:trip_manager + business_city_id, mapped via transformAgent', async () => {
    const post = vi
      .spyOn(apiClient, 'post')
      .mockReturnValue(ok({ id: 'a1', user_id: 'u3', full_name: 'Agent A', phone: '+91', business_name: 'A Travels', kyc_status: 'pending' }) as never);
    const agent = await createMyAgentProfile({ fullName: 'Agent A', businessCityId: 'c1', businessName: 'A Travels' });
    expect(post).toHaveBeenCalledWith('/drivers', { role: 'trip_manager', full_name: 'Agent A', business_city_id: 'c1', business_name: 'A Travels' });
    expect(agent.id).toBe('a1');
    expect(agent.businessName).toBe('A Travels');
  });

  it('getDriver → GET /drivers/:id', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok({ id: 'd9', user_id: 'u9' }) as never);
    const driver = await getDriver('d9');
    expect(get).toHaveBeenCalledWith('/drivers/d9');
    expect(driver.id).toBe('d9');
  });

  it('getAgents({ kycStatus }) → GET /agents?kyc_status=', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok([{ id: 'a1', user_id: 'u1', kyc_status: 'docs_submitted' }]) as never);
    const agents = await getAgents({ kycStatus: 'docs_submitted' });
    expect(get).toHaveBeenCalledWith('/agents', { kyc_status: 'docs_submitted' });
    expect(agents[0]?.id).toBe('a1');
  });

  it('updateDriverKyc → PATCH /drivers/:id/kyc { kyc_status, note? }', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockReturnValue(ok({ id: 'd1', user_id: 'u1', kyc_status: 'approved' }) as never);
    const driver = await updateDriverKyc('d1', 'approved');
    expect(patch).toHaveBeenCalledWith('/drivers/d1/kyc', { kyc_status: 'approved' });
    expect(driver.kycStatus).toBe('approved');
    await updateDriverKyc('d1', 'rejected', 'docs unclear');
    expect(patch).toHaveBeenLastCalledWith('/drivers/d1/kyc', { kyc_status: 'rejected', note: 'docs unclear' });
  });

  it('updateAgentKyc → PATCH /agents/:id/kyc', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockReturnValue(ok({ id: 'a1', user_id: 'u1', kyc_status: 'approved' }) as never);
    const agent = await updateAgentKyc('a1', 'approved');
    expect(patch).toHaveBeenCalledWith('/agents/a1/kyc', { kyc_status: 'approved' });
    expect(agent.kycStatus).toBe('approved');
  });
});
