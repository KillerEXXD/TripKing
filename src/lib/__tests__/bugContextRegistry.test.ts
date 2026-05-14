import { describe, it, expect, beforeEach } from 'vitest';
import { __clearBugContextForTests, getBugContext, registerBugContext } from '@/lib/bugContextRegistry';

beforeEach(() => __clearBugContextForTests());

describe('bugContextRegistry', () => {
  it('returns whatever every registered getter produces, keyed by name', () => {
    registerBugContext('auth', () => ({ userId: 'u1' }));
    registerBugContext('route', () => '/trips/42');
    expect(getBugContext()).toEqual({ auth: { userId: 'u1' }, route: '/trips/42' });
  });

  it('catches throws from a getter and records the error', () => {
    registerBugContext('broken', () => {
      throw new Error('nope');
    });
    expect(getBugContext()).toEqual({ broken: { error: 'nope' } });
  });

  it('returns an unregister function', () => {
    const off = registerBugContext('x', () => 1);
    expect(getBugContext()).toEqual({ x: 1 });
    off();
    expect(getBugContext()).toEqual({});
  });
});
