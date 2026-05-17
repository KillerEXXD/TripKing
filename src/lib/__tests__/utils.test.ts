import { describe, it, expect } from 'vitest';
import { cn, formatINR, formatKm, formatKmAndDuration, formatPickupDateTime, formatRating, formatClockTime, formatRelativeTime, formatShortDate, getFirstName, isValidUUID, initials, haversineKm, isWithinMinutes } from '@/lib/utils';

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
  it('formats km + driving duration together', () => {
    // etaLabel uses 40 km/h → 140 km → 210 min → "~3 hr 30 min"
    expect(formatKmAndDuration(140)).toBe('140 km · ~3 hr 30 min');
    expect(formatKmAndDuration(20)).toBe('20 km · ~30 min'); // <1hr branch
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
  it('formatPickupDateTime renders DD/MM/YYYY HH:MM AM/PM', () => {
    // Construct in local time so the en-IN locale matches the assertion regardless of test-runner TZ.
    const out = formatPickupDateTime(new Date(2026, 9, 6, 8, 0).toISOString()); // 6 Oct 2026, 08:00 local
    expect(out).toMatch(/^06\/10\/2026 08:00 AM$/);
  });
  it('formatPickupDateTime falls back to raw string when unparseable', () => {
    expect(formatPickupDateTime('not-a-date')).toBe('not-a-date');
  });
});

describe('freshness helpers (NEW badge)', () => {
  const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
  it('isWithinMinutes — true for trips inside the window, false outside', () => {
    expect(isWithinMinutes(minsAgo(1), 5)).toBe(true);
    expect(isWithinMinutes(minsAgo(4.99), 5)).toBe(true);
    expect(isWithinMinutes(minsAgo(5.01), 5)).toBe(false);
    expect(isWithinMinutes(minsAgo(60), 5)).toBe(false);
  });
  it('isWithinMinutes — null / unparseable → false (no badge for missing data)', () => {
    expect(isWithinMinutes(null)).toBe(false);
    expect(isWithinMinutes(undefined)).toBe(false);
    expect(isWithinMinutes('garbage')).toBe(false);
  });
  it('formatRelativeTime — bucketed coarsely', () => {
    expect(formatRelativeTime(minsAgo(0))).toBe('just now');
    expect(formatRelativeTime(minsAgo(2))).toBe('2m ago');
    expect(formatRelativeTime(minsAgo(90))).toBe('1h ago'); // 90 min → 1h ago (floor)
    expect(formatRelativeTime(new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString())).toBe('3d ago');
  });
  it('formatRelativeTime — empty / unparseable → empty string', () => {
    expect(formatRelativeTime(null)).toBe('');
    expect(formatRelativeTime('')).toBe('');
    expect(formatRelativeTime('garbage')).toBe('');
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

describe('getFirstName (header greeting)', () => {
  it('returns the only word when the full name is a single word', () => {
    expect(getFirstName('Ravee')).toBe('Ravee');
  });
  it('appends the second word\'s upper-cased initial', () => {
    expect(getFirstName('Ravi Kumar')).toBe('Ravi K');
    expect(getFirstName('ravi kumar')).toBe('ravi K');
  });
  it('keeps only one initial — third+ words are dropped', () => {
    expect(getFirstName('Ravi Kumar Sharma')).toBe('Ravi K');
  });
  it('handles extra whitespace', () => {
    expect(getFirstName('  Ravi   Kumar  ')).toBe('Ravi K');
  });
  it('returns empty string for nullish / blank input', () => {
    expect(getFirstName(undefined)).toBe('');
    expect(getFirstName(null)).toBe('');
    expect(getFirstName('')).toBe('');
    expect(getFirstName('   ')).toBe('');
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
