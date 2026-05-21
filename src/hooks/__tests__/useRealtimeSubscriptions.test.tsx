import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

// ── mocks ────────────────────────────────────────────────────────────────────
// Capture the change-handler registered for each table so the test can fire
// synthetic Postgres events at it and assert the resulting invalidations.
const handlers = new Map<string, (p: unknown) => void>();
const removed: string[] = [];

function fakeChannel(name: string) {
  const table = name.split(':')[1];
  const ch = {
    on: (_evt: string, _opts: unknown, handler: (p: unknown) => void) => {
      handlers.set(table, handler);
      return ch;
    },
    subscribe: () => ch,
    _name: name,
  };
  return ch;
}
const fakeClient = {
  channel: (name: string) => fakeChannel(name),
  removeChannel: (ch: { _name: string }) => { removed.push(ch._name); },
};

vi.mock('@/lib/realtime', () => ({
  isRealtimeConfigured: () => true,
  getRealtimeClient: () => fakeClient,
  setRealtimeAuth: vi.fn(),
}));

const invalidateSpy = vi.fn();
vi.mock('@/lib/queryClient', () => ({ queryClient: { invalidateQueries: (...a: unknown[]) => invalidateSpy(...a) } }));
vi.mock('@/lib/api/client', () => ({ apiClient: { getAccessToken: () => 'jwt' } }));

const useAuthMock = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => useAuthMock() }));

import { useRealtimeSubscriptions } from '@/hooks/useRealtimeSubscriptions';

function fire(table: string, payload: Partial<RealtimePostgresChangesPayload<Record<string, unknown>>>) {
  const h = handlers.get(table);
  if (!h) throw new Error(`no handler registered for ${table}`);
  h(payload);
}
function invalidatedKeys(): unknown[][] {
  return invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);
}

describe('useRealtimeSubscriptions', () => {
  beforeEach(() => {
    handlers.clear();
    removed.length = 0;
    invalidateSpy.mockReset();
    useAuthMock.mockReturnValue({ user: { id: 'agent-1' } });
  });

  it('subscribes one channel per watched table while signed in', () => {
    renderHook(() => useRealtimeSubscriptions());
    expect([...handlers.keys()].sort()).toEqual(['notifications', 'trip_acceptances', 'trips', 'vacancies']);
  });

  it('does nothing when there is no user (degrades to polling)', () => {
    useAuthMock.mockReturnValue({ user: null });
    renderHook(() => useRealtimeSubscriptions());
    expect(handlers.size).toBe(0);
  });

  it('trip_acceptances change → invalidates the trip applicants, the trip, and the lists', () => {
    renderHook(() => useRealtimeSubscriptions());
    fire('trip_acceptances', { new: { trip_id: 't-9', id: 'acc-1' } });
    const keys = invalidatedKeys();
    expect(keys).toContainEqual(['trip', 't-9', 'applicants']);
    expect(keys).toContainEqual(['trip', 't-9']);
    expect(keys).toContainEqual(['trips']);
  });

  it('trip_acceptances DELETE falls back to old-row trip_id', () => {
    renderHook(() => useRealtimeSubscriptions());
    fire('trip_acceptances', { old: { trip_id: 't-old' } });
    expect(invalidatedKeys()).toContainEqual(['trip', 't-old', 'applicants']);
  });

  it('trips change → invalidates that trip detail + the lists', () => {
    renderHook(() => useRealtimeSubscriptions());
    fire('trips', { new: { id: 't-5', posted_by_user_id: 'agent-1' } });
    const keys = invalidatedKeys();
    expect(keys).toContainEqual(['trip', 't-5']);
    expect(keys).toContainEqual(['trips']);
  });

  it('notifications change → invalidates the notifications list only', () => {
    renderHook(() => useRealtimeSubscriptions());
    fire('notifications', { new: { id: 'n-1' } });
    expect(invalidatedKeys()).toEqual([['notifications']]);
  });

  it('vacancies change → invalidates the vacancies feed', () => {
    renderHook(() => useRealtimeSubscriptions());
    fire('vacancies', { new: { id: 'v-1' } });
    expect(invalidatedKeys()).toContainEqual(['vacancies']);
  });

  it('removes every channel on unmount', () => {
    const { unmount } = renderHook(() => useRealtimeSubscriptions());
    unmount();
    expect(removed.sort()).toEqual([
      'rt:notifications:agent-1',
      'rt:trip_acceptances:agent-1',
      'rt:trips:agent-1',
      'rt:vacancies:agent-1',
    ]);
  });
});
