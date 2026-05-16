import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '@/lib/api/client';
import * as transforms from '@/lib/api/transforms/referral';
import {
  getAdminWithdrawals,
  getMyReferralDashboard,
  getMyReferralEarnings,
  getMyReferred,
  getMyWithdrawals,
  patchAdminWithdrawal,
  requestReferralWithdrawal,
  transferReferralToCashWallet,
} from '@/lib/api/services/referrals';

function ok<T>(data: T) {
  return Promise.resolve({ success: true, data, error: null } as const);
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(transforms, 'transformReferralDashboard').mockImplementation((api) => ({ userId: (api as { user_id: string }).user_id, summary: {} as never, recentLedger: [] }));
  vi.spyOn(transforms, 'transformReferralLink').mockImplementation((api) => ({ id: (api as { id: string }).id } as never));
  vi.spyOn(transforms, 'transformReferralEarnings').mockImplementation((api) => ({ from: (api as { from: string }).from, to: '', days: [] }));
  vi.spyOn(transforms, 'transformWithdrawal').mockImplementation((api) => ({ id: (api as { id: string }).id } as never));
});

describe('referrals service', () => {
  it('getMyReferralDashboard → GET /referrals/me', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok({ user_id: 'u1' }) as never);
    const d = await getMyReferralDashboard();
    expect(get).toHaveBeenCalledWith('/referrals/me');
    expect(d.userId).toBe('u1');
  });

  it('getMyReferred passes status + role as query params', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok([{ id: 'lk1' }]) as never);
    await getMyReferred({ status: 'qualified', role: 'driver' });
    expect(get).toHaveBeenCalledWith('/referrals/me/referred', { status: 'qualified', role: 'driver' });
  });

  it('getMyReferred omits the params object when empty', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok([]) as never);
    await getMyReferred();
    expect(get).toHaveBeenCalledWith('/referrals/me/referred', undefined);
  });

  it('getMyReferralEarnings forwards from/to', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok({ from: '2026-01-01', to: '2026-01-31', days: [] }) as never);
    await getMyReferralEarnings({ from: '2026-01-01', to: '2026-01-31' });
    expect(get).toHaveBeenCalledWith('/referrals/me/earnings', { from: '2026-01-01', to: '2026-01-31' });
  });

  it('transferReferralToCashWallet POSTs amount_paise + maps the balance row', async () => {
    const post = vi.spyOn(apiClient, 'post').mockReturnValue(ok({ promo_paise: 100000, transferred_paise: 50000, cash_paise: 0, total_paise: 150000, net_referral_paise: 200000 }) as never);
    const r = await transferReferralToCashWallet(50000);
    expect(post).toHaveBeenCalledWith('/referrals/me/transfer-to-wallet', { amount_paise: 50000 });
    expect(r.transferredPaise).toBe(50000);
    expect(r.netReferralPaise).toBe(200000);
  });

  it('requestReferralWithdrawal POSTs amount + upi + projects the row', async () => {
    const post = vi.spyOn(apiClient, 'post').mockReturnValue(ok({ withdrawal_id: 'w1', amount_paise: 50000, status: 'requested', withdrawable_remaining_paise: 0 }) as never);
    const r = await requestReferralWithdrawal(50000, 'me@upi');
    expect(post).toHaveBeenCalledWith('/referrals/me/withdraw', { amount_paise: 50000, upi_id: 'me@upi' });
    expect(r.withdrawalId).toBe('w1');
    expect(r.status).toBe('requested');
  });

  it('getMyWithdrawals → GET /referrals/me/withdrawals', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok([{ id: 'w1' }]) as never);
    const list = await getMyWithdrawals();
    expect(get).toHaveBeenCalledWith('/referrals/me/withdrawals');
    expect(list[0]?.id).toBe('w1');
  });

  it('getAdminWithdrawals passes status + user_id + limit query params', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok([]) as never);
    await getAdminWithdrawals({ status: 'requested', userId: 'u1', limit: 50 });
    expect(get).toHaveBeenCalledWith('/admin/withdrawals', { status: 'requested', user_id: 'u1', limit: 50 });
  });

  it('patchAdminWithdrawal PATCHes outcome + optional fields', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockReturnValue(ok({ id: 'w1' }) as never);
    await patchAdminWithdrawal('w1', { outcome: 'paid', externalTxnRef: 'utr-123' });
    expect(patch).toHaveBeenCalledWith('/admin/withdrawals/w1', { outcome: 'paid', external_txn_ref: 'utr-123' });
  });
});
