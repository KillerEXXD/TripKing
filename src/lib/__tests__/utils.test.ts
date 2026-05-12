import { describe, it, expect } from 'vitest';
import { cn, formatINR, formatKm, formatRating, formatClockTime, formatShortDate, isValidUUID, initials, haversineKm } from '@/lib/utils';

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('a', 'b')).toBe('a b');
  });
  it('dedupes conflicting Tailwind classes (last wins)', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
  });
  it('drops falsy values', () => {
    expect(cn('a', false, undefined, null, 'b')).toBe('a b');
  });
});

describe('money / distance formatters', () => {
  it('formats INR with Indian digit grouping', () => {
    expect(formatINR(1234567)).toBe('₹12,34,567');
    expect(formatINR(0)).toBe('₹0');
  });
  it('formats km', () => {
    expect(formatKm(140)).toBe('140 km');
  });
  it('formats a rating to one decimal', () => {
    expect(formatRating(4.84)).toBe('★ 4.8');
    expect(formatRating(4.86)).toBe('★ 4.9');
    expect(formatRating(5)).toBe('★ 5.0');
  });
});

describe('date / time formatters', () => {
  it('formats a short date without the year', () => {
    // month is 0-indexed → 4 = May; constructed in local time so the formatter (also local) is TZ-stable
    expect(formatShortDate(new Date(2026, 4, 12))).toBe('12 May');
  });
  it('formats a clock time as h:mm with am/pm', () => {
    const t = formatClockTime(new Date(2026, 4, 12, 18, 46));
    expect(t).toContain('6:46');
    expect(t.toLowerCase()).toMatch(/p\.?m/);
  });
  it('zero-pads the minutes', () => {
    const t = formatClockTime(new Date(2026, 4, 12, 9, 5));
    expect(t).toContain('9:05');
    expect(t.toLowerCase()).toMatch(/a\.?m/);
  });
});

describe('isValidUUID', () => {
  it('accepts a v4 uuid', () => {
    expect(isValidUUID('3b9d8e0a-1f2c-4b6a-9c1d-2e3f4a5b6c7d')).toBe(true);
  });
  it('rejects non-uuids', () => {
    expect(isValidUUID('not-a-uuid')).toBe(false);
    expect(isValidUUID('')).toBe(false);
    expect(isValidUUID(null)).toBe(false);
    expect(isValidUUID(undefined)).toBe(false);
  });
});

describe('initials', () => {
  it('takes first + last initial', () => {
    expect(initials('Ravi Kumar')).toBe('RK');
  });
  it('falls back to the first two letters of a single name', () => {
    expect(initials('Ravi')).toBe('RA');
  });
});

describe('haversineKm', () => {
  it('returns 0 for the same point', () => {
    expect(haversineKm(13.05, 79.6, 13.05, 79.6)).toBe(0);
  });
  it('roughly matches Vellore → Chennai (~120 km)', () => {
    const d = haversineKm(12.9165, 79.1325, 13.0827, 80.2707);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(140);
  });
});
