import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useUpdateDriverLocation } from '@/hooks/useDrivers';
import type { Driver } from '@/types';

vi.mock('@/lib/api/services/drivers');
import { updateDriverLocation } from '@/lib/api/services/drivers';

const driverStub = { id: 'd1' } as unknown as Driver;

describe('useUpdateDriverLocation', () => {
  it('calls the location service and invalidates the driver + drivers queries on success', async () => {
    vi.mocked(updateDriverLocation).mockResolvedValue(driverStub);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(qc, 'invalidateQueries');
    const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);

    const { result } = renderHook(() => useUpdateDriverLocation(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 'd1', input: { lat: 13.05, lng: 80.2 } });
    });

    expect(updateDriverLocation).toHaveBeenCalledWith('d1', { lat: 13.05, lng: 80.2 });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['driver', 'd1'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['drivers'] });
  });
});
