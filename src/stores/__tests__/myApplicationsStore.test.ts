import { describe, it, expect, beforeEach } from 'vitest';
import { timeAgo, useMyApplicationsStore } from '@/stores/myApplicationsStore';

beforeEach(() => {
  useMyApplicationsStore.getState().reset();
  localStorage.clear();
});

describe('useMyApplicationsStore', () => {
  it('recordApplication stores the application keyed by tripId', () => {
    useMyApplicationsStore.getState().recordApplication({ tripId: 't1', acceptanceId: 'a1', appliedAt: '2026-05-01T00:00:00Z' });
    expect(useMyApplicationsStore.getState().byTrip.t1).toMatchObject({ tripId: 't1', acceptanceId: 'a1' });
  });

  it('clearApplication removes only the targeted trip; reset clears everything', () => {
    useMyApplicationsStore.getState().recordApplication({ tripId: 't1', acceptanceId: 'a1', appliedAt: '2026-05-01T00:00:00Z' });
    useMyApplicationsStore.getState().recordApplication({ tripId: 't2', acceptanceId: 'a2', appliedAt: '2026-05-01T00:00:00Z' });
    useMyApplicationsStore.getState().clearApplication('t1');
    expect(useMyApplicationsStore.getState().byTrip.t1).toBeUndefined();
    expect(useMyApplicationsStore.getState().byTrip.t2).toBeDefined();
    useMyApplicationsStore.getState().reset();
    expect(Object.keys(useMyApplicationsStore.getState().byTrip)).toHaveLength(0);
  });
});

describe('timeAgo', () => {
  const NOW = new Date('2026-05-13T12:00:00Z').getTime();

  it('returns "just now" for the last minute', () => {
    expect(timeAgo('2026-05-13T11:59:30Z', NOW)).toBe('just now');
  });

  it('returns "N min ago" under an hour', () => {
    expect(timeAgo('2026-05-13T11:30:00Z', NOW)).toBe('30 min ago');
  });

  it('returns "N hr/hrs ago" under a day, pluralizing correctly', () => {
    expect(timeAgo('2026-05-13T11:00:00Z', NOW)).toBe('1 hr ago');
    expect(timeAgo('2026-05-13T07:00:00Z', NOW)).toBe('5 hrs ago');
  });

  it('returns "Nd ago" past a day', () => {
    expect(timeAgo('2026-05-10T12:00:00Z', NOW)).toBe('3d ago');
  });

  it('falls back to "just now" on an invalid date', () => {
    expect(timeAgo('not-a-date', NOW)).toBe('just now');
  });
});
