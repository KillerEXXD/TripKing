import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useAdminDashboard, useAgentAnalytics, useApiMetricsSummary } from '@/hooks/useAnalytics';
import type { AdminDashboard, AgentAnalytics, ApiMetricsSummary } from '@/types';

vi.mock('@/lib/api/services/analytics');
import { getAdminDashboard, getAgentAnalytics, getApiMetricsSummary } from '@/lib/api/services/analytics';

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
}

describe('useAnalytics', () => {
  it('useAdminDashboard fetches the platform blob', async () => {
    vi.mocked(getAdminDashboard).mockResolvedValue({ usersTotal: 7 } as AdminDashboard);
    const { result } = renderHook(() => useAdminDashboard(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getAdminDashboard).toHaveBeenCalled();
    expect(result.current.data?.usersTotal).toBe(7);
  });

  it('useAgentAnalytics passes the userId through (or omits it for the caller)', async () => {
    vi.mocked(getAgentAnalytics).mockResolvedValue({ agentUserId: 'u-9', tripsPosted: 3 } as AgentAnalytics);
    const { result } = renderHook(() => useAgentAnalytics('u-9'), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getAgentAnalytics).toHaveBeenCalledWith('u-9');
    expect(result.current.data?.tripsPosted).toBe(3);

    vi.mocked(getAgentAnalytics).mockClear();
    const { result: r2 } = renderHook(() => useAgentAnalytics(), { wrapper: wrapper() });
    await waitFor(() => expect(r2.current.isSuccess).toBe(true));
    expect(getAgentAnalytics).toHaveBeenCalledWith(undefined);
  });

  it('useApiMetricsSummary passes hours through', async () => {
    vi.mocked(getApiMetricsSummary).mockResolvedValue({ hours: 48, endpoints: [] } as unknown as ApiMetricsSummary);
    const { result } = renderHook(() => useApiMetricsSummary(48), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getApiMetricsSummary).toHaveBeenCalledWith(48);
  });
});
