import { describe, it, expect } from 'vitest';
import { transformUser, UserTransformError } from '@/lib/api/transforms/user';

describe('transformUser', () => {
  it('maps a full snake_case payload to a camelCase User', () => {
    expect(
      transformUser({
        id: 'u1',
        role: 'driver',
        phone: '+919999999999',
        email: 'd@example.com',
        display_name: 'Ravi Kumar',
        preferred_language: 'ta',
        is_active: true,
        can_report_bugs: true,
      }),
    ).toEqual({
      id: 'u1',
      role: 'driver',
      phone: '+919999999999',
      email: 'd@example.com',
      displayName: 'Ravi Kumar',
      preferredLanguage: 'ta',
      isActive: true,
      canReportBugs: true,
    });
  });

  it('defaults optional fields (emailâ†’undefined, displayNameâ†’"", langâ†’en, activeâ†’true, canReportBugsâ†’false)', () => {
    const u = transformUser({ id: 'u2', role: 'admin', phone: '+910000000000' });
    expect(u.email).toBeUndefined();
    expect(u.displayName).toBe('');
    expect(u.preferredLanguage).toBe('en');
    expect(u.isActive).toBe(true);
    expect(u.canReportBugs).toBe(false);
  });

  it('canReportBugs is strict â€” only the boolean `true` enables it', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(transformUser({ id: 'u', role: 'driver', phone: '+91', can_report_bugs: 'true' as any }).canReportBugs).toBe(false);
    expect(transformUser({ id: 'u', role: 'driver', phone: '+91', can_report_bugs: false }).canReportBugs).toBe(false);
    expect(transformUser({ id: 'u', role: 'driver', phone: '+91', can_report_bugs: true }).canReportBugs).toBe(true);
  });

  it('throws on missing id / role / phone, and on an unknown role', () => {
    expect(() => transformUser({ role: 'driver', phone: '+91' })).toThrow(UserTransformError);
    expect(() => transformUser({ id: 'x', phone: '+91' })).toThrow(/no role/);
    expect(() => transformUser({ id: 'x', role: 'driver' })).toThrow(/no phone/);
    try {
      transformUser({ id: 'x', role: 'wizard', phone: '+91' });
      throw new Error('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(UserTransformError);
      expect((e as UserTransformError).code).toBe('BAD_ROLE');
    }
  });
});
