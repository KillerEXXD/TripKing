import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

vi.mock('@/lib/api/services/vacancies');
import * as svc from '@/lib/api/services/vacancies';
import { useCancelVacancy, usePostVacancy, useVacancies, useVacancy } from '@/hooks/useVacancies';

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
  return { qc, invalidate, wrapper };
}

beforeEach(() => vi.restoreAllMocks());

describe('useVacancies hooks', () => {
  it('useVacancies caches under ["vacancies", params]', async () => {
    vi.mocked(svc.getVacancies).mockResolvedValue([{ id: 'v1' }] as never);
    const { qc, wrapper } = setup();
    const params = { status: 'active' as const };
    const { result } = renderHook(() => useVacancies(params), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(svc.getVacancies).toHaveBeenCalledWith(params);
    expect(qc.getQueryData(['vacancies', params])).toEqual([{ id: 'v1' }]);
  });

  it('useVacancy is disabled without an id', () => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useVacancy(undefined), { wrapper });
    expect(svc.getVacancy).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('usePostVacancy invalidates the vacancies list on success', async () => {
    vi.mocked(svc.postVacancy).mockResolvedValue({ id: 'v1' } as never);
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => usePostVacancy(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({} as never);
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['vacancies'] });
  });

  it('useCancelVacancy invalidates both the list and the cancelled vacancy detail', async () => {
    vi.mocked(svc.cancelVacancy).mockResolvedValue({ id: 'v1' } as never);
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useCancelVacancy(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync('v1');
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['vacancies'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['vacancy', 'v1'] });
  });
});
