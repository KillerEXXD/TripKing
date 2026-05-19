import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAppBack } from '@/hooks/useAppBack';

const navigateSpy = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => navigateSpy };
});

function wrap(initial: { path: string; state?: unknown }): (props: { children: ReactNode }) => ReactNode {
  return function Wrapper({ children }) {
    return (
      <MemoryRouter initialEntries={[{ pathname: initial.path.split('?')[0], search: initial.path.includes('?') ? `?${initial.path.split('?')[1]}` : '', state: initial.state }]}>
        {children}
      </MemoryRouter>
    );
  };
}

describe('useAppBack', () => {
  beforeEach(() => navigateSpy.mockReset());

  it('navigates to ?from= when the URL carries a breadcrumb', () => {
    const { result } = renderHook(() => useAppBack(), { wrapper: wrap({ path: '/app/referrals?from=/app/trips' }) });
    act(() => result.current());
    expect(navigateSpy).toHaveBeenCalledWith('/app/trips');
  });

  it('falls through to location.state.from when ?from= is absent', () => {
    const { result } = renderHook(() => useAppBack(), { wrapper: wrap({ path: '/app/my-trips/review', state: { from: '/app/profile' } }) });
    act(() => result.current());
    expect(navigateSpy).toHaveBeenCalledWith('/app/profile');
  });

  it('prefers ?from= over location.state.from when both are set (URL is the canonical source)', () => {
    const { result } = renderHook(() => useAppBack(), {
      wrapper: wrap({ path: '/app/x?from=/app/url-source', state: { from: '/app/state-source' } }),
    });
    act(() => result.current());
    expect(navigateSpy).toHaveBeenCalledWith('/app/url-source');
  });

  it('falls back to navigate(-1) when there is browser history but no breadcrumb', () => {
    // MemoryRouter starts with length 1 entry, but we simulate "deep" history
    // by stubbing window.history.length. Real browser back is handled by
    // navigate(-1) — the spy lets us see that call directly.
    const originalLength = window.history.length;
    Object.defineProperty(window.history, 'length', { value: 5, configurable: true });
    try {
      const { result } = renderHook(() => useAppBack(), { wrapper: wrap({ path: '/app/profile' }) });
      act(() => result.current());
      expect(navigateSpy).toHaveBeenCalledWith(-1);
    } finally {
      Object.defineProperty(window.history, 'length', { value: originalLength, configurable: true });
    }
  });

  it('falls back to /app when there is no breadcrumb AND no browser history (deep-link entry)', () => {
    const originalLength = window.history.length;
    Object.defineProperty(window.history, 'length', { value: 1, configurable: true });
    try {
      const { result } = renderHook(() => useAppBack(), { wrapper: wrap({ path: '/app/profile' }) });
      act(() => result.current());
      expect(navigateSpy).toHaveBeenCalledWith('/app');
    } finally {
      Object.defineProperty(window.history, 'length', { value: originalLength, configurable: true });
    }
  });

  it('respects a custom fallback when passed', () => {
    const originalLength = window.history.length;
    Object.defineProperty(window.history, 'length', { value: 1, configurable: true });
    try {
      const { result } = renderHook(() => useAppBack('/app/trips'), { wrapper: wrap({ path: '/app/trips/abc' }) });
      act(() => result.current());
      expect(navigateSpy).toHaveBeenCalledWith('/app/trips');
    } finally {
      Object.defineProperty(window.history, 'length', { value: originalLength, configurable: true });
    }
  });
});
