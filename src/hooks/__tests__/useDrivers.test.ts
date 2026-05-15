import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useUpdateDriverLocation, useSubmitDriverKycDocs, useSubmitAgentKycDocs } from '@/hooks/useDrivers';
import type { Driver, Agent } from '@/types';

vi.mock('@/lib/api/services/drivers');
import { updateDriverLocation, submitDriverKycDocs, submitAgentKycDocs } from '@/lib/api/services/drivers';

const driverStub = { id: 'd1' } as unknown as Driver;
const agentStub = { id: 'a1' } as unknown as Agent;

function setupQc() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
  return { qc, invalidate, wrapper };
}

describe('useUpdateDriverLocation', () => {
  it('calls the location service and invalidates the driver + drivers queries on success', async () => {
    vi.mocked(updateDriverLocation).mockResolvedValue(driverStub);
    const { invalidate, wrapper } = setupQc();

    const { result } = renderHook(() => useUpdateDriverLocation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'd1', input: { lat: 13.05, lng: 80.2 } });
    });

    expect(updateDriverLocation).toHaveBeenCalledWith('d1', { lat: 13.05, lng: 80.2 });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['driver', 'd1'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['drivers'] });
  });
});

describe('KYC-doc submit invalidations refresh paginated admin lists too', () => {
  it('useSubmitDriverKycDocs invalidates the per-id driver AND the admin drivers list', async () => {
    vi.mocked(submitDriverKycDocs).mockResolvedValue(driverStub);
    const { invalidate, wrapper } = setupQc();
    const { result } = renderHook(() => useSubmitDriverKycDocs(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ driverId: 'd1', input: {} as never });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['driver', 'me'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['driver', 'd1'] });
    // The fix: the admin paginated list must also refresh so the new kyc_status row appears.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['drivers'] });
  });

  it('useSubmitAgentKycDocs mirrors the same fix on the manager side', async () => {
    vi.mocked(submitAgentKycDocs).mockResolvedValue(agentStub);
    const { invalidate, wrapper } = setupQc();
    const { result } = renderHook(() => useSubmitAgentKycDocs(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ agentId: 'a1', input: {} as never });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['agent', 'me'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['agent', 'a1'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['agents'] });
  });
});
