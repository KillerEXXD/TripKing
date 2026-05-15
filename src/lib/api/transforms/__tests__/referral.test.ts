import { describe, expect, it } from 'vitest';
import { ReferralTransformError, transformReferralSummary } from '@/lib/api/transforms/referral';

describe('transformReferralSummary', () => {
  it('returns undefined for null/undefined/non-object input', () => {
    expect(transformReferralSummary(null)).toBeUndefined();
    expect(transformReferralSummary(undefined)).toBeUndefined();
    expect(transformReferralSummary('nope')).toBeUndefined();
  });

  it('maps snake_case → camelCase', () => {
    expect(transformReferralSummary({ total_referred: 3, total_earnings_paise: 50000 })).toEqual({
      totalReferred: 3,
      totalEarningsPaise: 50000,
    });
  });

  it('throws on missing/non-numeric total_referred', () => {
    expect(() => transformReferralSummary({ total_earnings_paise: 0 })).toThrow(ReferralTransformError);
  });

  it('throws on missing/non-numeric total_earnings_paise', () => {
    expect(() => transformReferralSummary({ total_referred: 0 })).toThrow(ReferralTransformError);
  });
});
