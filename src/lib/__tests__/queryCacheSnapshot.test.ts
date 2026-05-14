import { describe, it, expect } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { snapshotQueryCache } from '@/lib/queryCacheSnapshot';

describe('snapshotQueryCache', () => {
  it('returns one entry per cached query with key + status only (no data payloads)', async () => {
    const qc = new QueryClient();
    qc.setQueryData(['trips'], [{ id: 't1', secret: 'pii' }]);
    qc.setQueryData(['user', 'u1'], { id: 'u1' });
    const snap = snapshotQueryCache(qc);
    expect(snap.length).toBe(2);
    for (const e of snap) {
      expect(['pending', 'success', 'error']).toContain(e.status);
      expect(e).not.toHaveProperty('data');
    }
    expect(snap.map((e) => e.queryKey)).toEqual(expect.arrayContaining([['trips'], ['user', 'u1']]));
  });
});
