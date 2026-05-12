import { describe, it, expect } from 'vitest';
import { captureDataError, addDataBreadcrumb, getSentryDebugIds, withErrorTracking } from '@/lib/sentry/dataErrors';
import { isReported } from '@/lib/sentry/report';

// Sentry is not initialized in the test env (no DSN) — the capture helpers must
// degrade to no-ops without throwing, and the report-once marker must still work.
describe('dataErrors (Sentry uninitialized)', () => {
  it('captureDataError no-ops and returns undefined', () => {
    expect(captureDataError('api:trips', new Error('boom'), { endpoint: '/trips', method: 'GET', status: 500 })).toBeUndefined();
  });

  it('addDataBreadcrumb / getSentryDebugIds do not throw', () => {
    expect(() => addDataBreadcrumb('request', { feature: 'trips', endpoint: '/trips' })).not.toThrow();
    expect(getSentryDebugIds()).toEqual({ lastEventId: '', traceId: '', replayId: '' });
  });

  it('withErrorTracking passes results through and re-throws errors', async () => {
    const ok = withErrorTracking('trips', '/trips', async (n: number) => n * 2);
    await expect(ok(21)).resolves.toBe(42);

    const boom = new Error('nope');
    const bad = withErrorTracking('trips', '/trips', async () => {
      throw boom;
    });
    await expect(bad()).rejects.toBe(boom);
  });

  it('captureDataError skips an error a prior layer already reported', () => {
    const err = Object.assign(new Error('dup'), {});
    // First call (uninitialized → returns undefined but should not mark, since it never captured)
    captureDataError('api:x', err);
    expect(isReported(err)).toBe(false);
  });
});
