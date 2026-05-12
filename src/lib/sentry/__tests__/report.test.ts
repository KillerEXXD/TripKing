import { describe, it, expect } from 'vitest';
import { markReported, isReported } from '@/lib/sentry/report';

describe('report-once marker', () => {
  it('marks and detects an Error object', () => {
    const err = new Error('boom');
    expect(isReported(err)).toBe(false);
    markReported(err);
    expect(isReported(err)).toBe(true);
  });

  it('marks plain objects too', () => {
    const obj = { status: 500 };
    markReported(obj);
    expect(isReported(obj)).toBe(true);
  });

  it('is a no-op for non-objects and never throws', () => {
    expect(() => markReported('a string')).not.toThrow();
    expect(() => markReported(undefined)).not.toThrow();
    expect(() => markReported(42)).not.toThrow();
    expect(isReported('a string')).toBe(false);
    expect(isReported(undefined)).toBe(false);
    expect(isReported(null)).toBe(false);
  });

  it('the mark is non-enumerable (does not leak into JSON / spread)', () => {
    const err = Object.assign(new Error('x'), { code: 'X' });
    markReported(err);
    expect(Object.keys(err)).not.toContain('tk.reported');
    expect(JSON.stringify({ ...err })).not.toMatch(/reported/);
  });
});
