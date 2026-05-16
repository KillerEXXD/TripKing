import { describe, expect, it } from 'vitest';
import {
  transformReferralBlock,
  transformReferralDashboard,
  transformReferralEarnings,
  transformReferralLedgerEntry,
  transformReferralLink,
  transformReferralSummary,
  transformReferralTier,
} from '@/lib/api/transforms/referral';

describe('referral transforms — Stage 4', () => {
  it('transformReferralSummary returns undefined for null/non-object', () => {
    expect(transformReferralSummary(null)).toBeUndefined();
    expect(transformReferralSummary(undefined)).toBeUndefined();
    expect(transformReferralSummary('nope')).toBeUndefined();
  });

  it('transformReferralSummary maps the new Stage-4 shape', () => {
    expect(transformReferralSummary({
      total_referred: 3,
      verified_referrals: 2,
      qualified_referrals: 1,
      earning_active: 1,
      cap_reached: 0,
      lifetime_earned_paise: 50000,
      pending_paise: 0,
      released_paise: 50000,
      withdrawable_paise: 50000,
    })).toEqual({
      totalReferred: 3,
      verifiedReferrals: 2,
      qualifiedReferrals: 1,
      earningActive: 1,
      capReached: 0,
      lifetimeEarnedPaise: 50000,
      pendingPaise: 0,
      releasedPaise: 50000,
      withdrawablePaise: 50000,
    });
  });

  it('transformReferralBlock requires a code; otherwise returns undefined', () => {
    expect(transformReferralBlock(null)).toBeUndefined();
    expect(transformReferralBlock({})).toBeUndefined();
    const blk = transformReferralBlock({ code: 'ABC12345', referred_by_user_id: 'u-7', summary: { total_referred: 0 } });
    expect(blk?.code).toBe('ABC12345');
    expect(blk?.referredByUserId).toBe('u-7');
    expect(blk?.summary.totalReferred).toBe(0);
  });

  it('transformReferralBlock supplies a zero summary when summary is missing', () => {
    const blk = transformReferralBlock({ code: 'X' });
    expect(blk?.summary.lifetimeEarnedPaise).toBe(0);
  });

  it('transformReferralLedgerEntry maps snake → camel', () => {
    const e = transformReferralLedgerEntry({ id: 'l1', referral_link_id: 'lk1', entry_type: 'accrual', amount_paise: 5000, trip_id: 't1', created_at: '2026-01-01T00:00:00Z' });
    expect(e).toMatchObject({ id: 'l1', referralLinkId: 'lk1', entryType: 'accrual', amountPaise: 5000, tripId: 't1' });
  });

  it('transformReferralDashboard projects summary + ledger', () => {
    const d = transformReferralDashboard({
      user_id: 'u1',
      summary: { lifetime_earned_paise: 10000, net_paise: 10000, withdrawable_paise: 10000, counts: { total_referred: 4, qualified: 2, signed_up: 2, verified: 1, verification_pending: 1, verification_rejected: 0, paid_trips_started: 1, earning_active: 1, cap_reached: 0, suspended: 0, rejected: 0, expired: 0 } },
      recent_ledger: [{ id: 'l1', entry_type: 'accrual', amount_paise: 5000, created_at: '2026-01-01' }],
    });
    expect(d.userId).toBe('u1');
    expect(d.summary.counts.totalReferred).toBe(4);
    expect(d.recentLedger).toHaveLength(1);
  });

  it('transformReferralLink throws on missing required ids', () => {
    expect(() => transformReferralLink({})).toThrow();
  });

  it('transformReferralLink projects status + amounts + referred user', () => {
    const lk = transformReferralLink({
      id: 'lk1', referrer_user_id: 'u1', referred_user_id: 'u2', referred_user_role: 'driver',
      status: 'qualified', cap_paise: 250000, payout_per_trip_paise: 5000, eligible_paid_trips_count: 3, total_earned_paise: 15000,
      created_at: 'x', updated_at: 'y', referred_user: { id: 'u2', display_name: 'Asha', role: 'driver' },
    });
    expect(lk.status).toBe('qualified');
    expect(lk.referredUser?.displayName).toBe('Asha');
  });

  it('transformReferralLedgerEntry attaches trip route + fee + name enrichments', () => {
    const e = transformReferralLedgerEntry({
      id: 'l1', entry_type: 'accrual', amount_paise: 5000, created_at: 'x',
      trip: { id: 't1', from_city: { name: 'Vellore' }, to_city: { name: 'Chennai' } },
      fee: { id: 'f1', side: 'driver', payment_source: 'cash_wallet' },
      referred_user_name: 'Asha',
    });
    expect(e.tripRoute).toEqual({ from: 'Vellore', to: 'Chennai' });
    expect(e.paymentSource).toBe('cash_wallet');
    expect(e.feeSide).toBe('driver');
    expect(e.referredUserName).toBe('Asha');
  });

  it('transformReferralTier maps slot + nulls for top tier', () => {
    const t = transformReferralTier({
      id: 't1', slot_name: 'Tier 4', min_qualified_referrals: 51, max_qualified_referrals: null,
      cap_paise: null, payout_per_trip_paise: null, applies_to_role: 'driver', sort_order: 4, is_active: true,
    });
    expect(t.slotName).toBe('Tier 4');
    expect(t.maxQualifiedReferrals).toBeNull();
    expect(t.capPaise).toBeNull();
    expect(t.appliesToRole).toBe('driver');
  });

  it('transformReferralLink picks up lastTripAt', () => {
    const lk = transformReferralLink({
      id: 'lk1', referrer_user_id: 'u1', referred_user_id: 'u2', referred_user_role: 'driver',
      status: 'qualified', cap_paise: 1, payout_per_trip_paise: 1, eligible_paid_trips_count: 0, total_earned_paise: 0,
      created_at: 'x', updated_at: 'y', last_trip_at: '2026-05-01T00:00:00Z',
    });
    expect(lk.lastTripAt).toBe('2026-05-01T00:00:00Z');
  });

  it('transformReferralEarnings maps the per-day series', () => {
    const s = transformReferralEarnings({ from: '2026-01-01', to: '2026-01-31', days: [{ date: '2026-01-05', trips: 2, paise: 10000 }] });
    expect(s.days).toEqual([{ date: '2026-01-05', trips: 2, paise: 10000 }]);
  });
});
