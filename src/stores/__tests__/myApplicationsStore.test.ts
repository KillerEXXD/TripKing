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

  it('markWithdrawn stamps withdrawnAt on the row but keeps the row in the store', () => {
    useMyApplicationsStore.getState().recordApplication({ tripId: 't1', acceptanceId: 'a1', appliedAt: '2026-05-01T00:00:00Z' });
    useMyApplicationsStore.getState().markWithdrawn('t1');
    const row = useMyApplicationsStore.getState().byTrip.t1;
    expect(row).toBeDefined();
    expect(row?.withdrawnAt).toBeTruthy();
    expect(typeof row?.withdrawnAt).toBe('string');
  });

  it('markWithdrawn is a no-op when the row does not exist (safe to call from a stale UI)', () => {
    useMyApplicationsStore.getState().markWithdrawn('does-not-exist');
    expect(useMyApplicationsStore.getState().byTrip['does-not-exist']).toBeUndefined();
  });

  it('recordApplication overwrites a previously-withdrawn row (re-apply clears withdrawnAt)', () => {
    useMyApplicationsStore.getState().recordApplication({ tripId: 't1', acceptanceId: 'a1', appliedAt: '2026-05-01T00:00:00Z' });
    useMyApplicationsStore.getState().markWithdrawn('t1');
    expect(useMyApplicationsStore.getState().byTrip.t1?.withdrawnAt).toBeTruthy();
    useMyApplicationsStore.getState().recordApplication({ tripId: 't1', acceptanceId: 'a2', appliedAt: '2026-05-02T00:00:00Z' });
    expect(useMyApplicationsStore.getState().byTrip.t1?.withdrawnAt).toBeUndefined();
    expect(useMyApplicationsStore.getState().byTrip.t1?.acceptanceId).toBe('a2');
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
