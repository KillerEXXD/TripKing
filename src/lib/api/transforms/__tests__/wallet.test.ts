import { describe, expect, it } from 'vitest';
import {
  WalletTransformError,
  transformBalance,
  transformLedgerEntry,
  transformTopupInitiate,
  transformTopupVerify,
  transformWallet,
} from '@/lib/api/transforms/wallet';

describe('wallet transforms', () => {
  it('transformBalance maps snake_case → camelCase', () => {
    expect(transformBalance({ promo_paise: 100000, transferred_paise: 0, cash_paise: 50000, total_paise: 150000 })).toEqual({
      promoPaise: 100000,
      transferredPaise: 0,
      cashPaise: 50000,
      totalPaise: 150000,
    });
  });

  it('transformBalance throws when a balance field is missing', () => {
    expect(() => transformBalance({ promo_paise: 0, cash_paise: 0, total_paise: 0 })).toThrow(WalletTransformError);
  });

  it('transformLedgerEntry classifies sub_balance + entry_type', () => {
    const e = transformLedgerEntry({ id: 'l1', entry_type: 'topup', sub_balance: 'cash', amount_paise: 50000, payment_source: 'direct_upi', created_at: '2026-01-01T00:00:00Z', note: 'Top-up' });
    expect(e.entryType).toBe('topup');
    expect(e.subBalance).toBe('cash');
    expect(e.amountPaise).toBe(50000);
  });

  it('transformLedgerEntry throws on unknown sub_balance', () => {
    expect(() => transformLedgerEntry({ id: 'l1', entry_type: 'topup', sub_balance: 'mystery', amount_paise: 1, created_at: 'x' })).toThrow(WalletTransformError);
  });

  it('transformWallet projects the full payload', () => {
    const w = transformWallet({
      wallet_id: 'w1',
      balance: { promo_paise: 100000, transferred_paise: 0, cash_paise: 0, total_paise: 100000 },
      recent_ledger: [{ id: 'l1', entry_type: 'promo_credit_grant', sub_balance: 'promo', amount_paise: 100000, created_at: '2026-01-01T00:00:00Z' }],
    });
    expect(w.walletId).toBe('w1');
    expect(w.balance.promoPaise).toBe(100000);
    expect(w.recentLedger).toHaveLength(1);
  });

  it('transformTopupInitiate carries stubbed flag', () => {
    expect(transformTopupInitiate({ topup_id: 't1', order_id: 'order_x', amount_paise: 50000, razorpay_key_id: '', stubbed: true })).toEqual({
      topupId: 't1', orderId: 'order_x', amountPaise: 50000, razorpayKeyId: '', stubbed: true, message: undefined,
    });
  });

  it('transformTopupVerify reports already-credited', () => {
    const v = transformTopupVerify({ topup_id: 't1', status: 'succeeded', already_credited: true });
    expect(v.alreadyCredited).toBe(true);
  });
});
