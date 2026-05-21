import { describe, it, expect } from 'vitest';
import { isRealtimeConfigured, getRealtimeClient, setRealtimeAuth, disconnectRealtime } from '@/lib/realtime';

/**
 * In the test env VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are unset, so the
 * module must degrade to a safe no-op (the app falls back to React Query
 * polling) rather than throwing. The configured/connected path is exercised by
 * the two-session manual test + the subscription-hook test (which mocks the
 * client).
 */
describe('realtime (unconfigured env)', () => {
  it('isRealtimeConfigured() is false when env vars are absent', () => {
    expect(isRealtimeConfigured()).toBe(false);
  });

  it('getRealtimeClient() returns null instead of constructing a client', () => {
    expect(getRealtimeClient()).toBeNull();
  });

  it('setRealtimeAuth() is a no-op (does not throw) when unconfigured', () => {
    expect(() => setRealtimeAuth('some.jwt.token')).not.toThrow();
    expect(() => setRealtimeAuth(null)).not.toThrow();
  });

  it('disconnectRealtime() is a no-op (does not throw) when nothing was created', () => {
    expect(() => disconnectRealtime()).not.toThrow();
  });
});
