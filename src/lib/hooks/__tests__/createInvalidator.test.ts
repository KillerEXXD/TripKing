import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { createInvalidator } from '@/lib/hooks/createInvalidator';

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
  return { invalidate, wrapper };
}

describe('createInvalidator', () => {
  it('invalidates the list key when called without an id', () => {
    const useInv = createInvalidator('trips', 'trip');
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useInv(), { wrapper });
    result.current();
    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['trips'] });
  });

  it('invalidates both list and per-item key when an id is passed', () => {
    const useInv = createInvalidator('drivers', 'driver');
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useInv(), { wrapper });
    result.current('d-123');
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['drivers'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['driver', 'd-123'] });
  });
});
