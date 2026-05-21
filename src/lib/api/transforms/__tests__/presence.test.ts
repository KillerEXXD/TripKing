import { describe, it, expect } from 'vitest';
import { transformPresence, transformPlatformConfig } from '@/lib/api/transforms/presence';

describe('transformPresence', () => {
  it('maps status + camelCases fields', () => {
    const p = transformPresence({
      status: 'online',
      is_online: true,
      online_since: '2026-01-01T00:00:00Z',
      last_heartbeat_at: '2026-01-01T00:00:30Z',
      grace_expires_at: null,
      vehicle_id: 'v1',
      busy_trip_id: null,
      current_lat: 12.9,
      current_lng: 79.1,
    });
    expect(p).toEqual({
      status: 'online',
      isOnline: true,
      onlineSince: '2026-01-01T00:00:00Z',
      lastHeartbeatAt: '2026-01-01T00:00:30Z',
      graceExpiresAt: null,
      vehicleId: 'v1',
      busyTripId: null,
      currentLat: 12.9,
      currentLng: 79.1,
    });
  });
  it('fails safe to offline on unknown/absent status', () => {
    expect(transformPresence({ status: 'weird' }).status).toBe('offline');
    expect(transformPresence({}).status).toBe('offline');
  });
  it('maps grace', () => {
    expect(transformPresence({ status: 'grace', grace_expires_at: '2026-01-01T00:03:00Z' }).status).toBe('grace');
  });
});

describe('transformPlatformConfig', () => {
  it('maps auto + provided numbers', () => {
    const c = transformPlatformConfig({ dispatch_algorithm: 'auto', dispatch_offer_seconds: 45, dispatch_offline_grace_seconds: 120, dispatch_heartbeat_stale_seconds: 60 });
    expect(c).toEqual({ dispatchAlgorithm: 'auto', dispatchOfferSeconds: 45, dispatchOfflineGraceSeconds: 120, dispatchHeartbeatStaleSeconds: 60 });
  });
  it('fails safe to manual + documented defaults when absent/invalid', () => {
    const c = transformPlatformConfig({ dispatch_algorithm: 'bogus' });
    expect(c.dispatchAlgorithm).toBe('manual');
    expect(c.dispatchOfferSeconds).toBe(60);
    expect(c.dispatchOfflineGraceSeconds).toBe(180);
    expect(c.dispatchHeartbeatStaleSeconds).toBe(90);
  });
});
