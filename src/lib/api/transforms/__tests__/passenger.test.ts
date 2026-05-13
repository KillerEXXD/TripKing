import { describe, it, expect } from 'vitest';
import { PassengerTransformError, transformPassenger } from '@/lib/api/transforms/passenger';

const FULL = {
  id: 'p1',
  phone: '+919876543210',
  name: 'Jane',
  aliases: ['Janet', 'J.'],
  referred_by_user_id: 'u9',
  display_handle: 'A1B2C3D',
  referred_by: { id: 'u9', display_name: 'Agent A', role: 'trip_manager', phone: '+919000000000' },
  first_trip_id: 't1',
  first_seen_at: '2026-05-01T10:00:00Z',
  trips_count: 3,
  created_at: '2026-05-01T10:00:00Z',
  updated_at: '2026-05-13T10:00:00Z',
};

describe('transformPassenger', () => {
  it('maps a full passenger row, snake → camel, incl. the joined referrer + aliases', () => {
    const p = transformPassenger(FULL);
    expect(p).toMatchObject({ id: 'p1', phone: '+919876543210', name: 'Jane', aliases: ['Janet', 'J.'], referredByUserId: 'u9', firstTripId: 't1', tripsCount: 3 });
    expect(p.referredBy).toEqual({ id: 'u9', displayName: 'Agent A', role: 'trip_manager', phone: '+919000000000' });
  });
  it('defaults aliases to [] and trips_count to 0; tolerates an absent referrer', () => {
    const p = transformPassenger({ id: 'p2', phone: '+91', name: 'Anon' });
    expect(p.aliases).toEqual([]);
    expect(p.tripsCount).toBe(0);
    expect(p.referredBy).toBeUndefined();
    expect(p.referredByUserId).toBeUndefined();
  });
  it('throws PassengerTransformError on a missing id / phone / name, or a non-object', () => {
    expect(() => transformPassenger({ ...FULL, id: undefined })).toThrow(PassengerTransformError);
    expect(() => transformPassenger({ ...FULL, phone: '' })).toThrow(/phone/);
    expect(() => transformPassenger({ ...FULL, name: undefined })).toThrow(/name/);
    expect(() => transformPassenger(null)).toThrow(PassengerTransformError);
    expect(() => transformPassenger([])).toThrow(PassengerTransformError);
  });
});
