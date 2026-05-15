/**
 * Cash Wallet — Stage 2 of the referral program.
 * Three sub-balances: `promo` (launch credit, can't be withdrawn), `transferred`
 * (referral earnings transferred in — Stage 6+), `cash` (real-money top-ups, withdrawable).
 */

export type CashWalletSubBalance = 'promo' | 'transferred' | 'cash';

export type CashWalletEntryType =
  | 'topup'
  | 'fee_debit'
  | 'refund'
  | 'transfer_in_from_referral'
  | 'promo_credit_grant'
  | 'adjustment';

export type CashWalletPaymentSource =
  | 'direct_upi'
  | 'direct_card'
  | 'promo_credit'
  | 'earnings_transfer_credit'
  | 'admin_bonus'
  | 'coupon';

export interface CashWalletBalance {
  /** Stage-2 launch credit + admin bonuses + coupons. Can't be withdrawn. */
  promoPaise: number;
  /** Earnings transferred in from referrals (Stage 6+). Can be withdrawn. */
  transferredPaise: number;
  /** Real-money top-ups. Can be withdrawn. */
  cashPaise: number;
  /** `promo + transferred + cash`. */
  totalPaise: number;
}

export interface CashWalletLedgerEntry {
  id: string;
  entryType: CashWalletEntryType;
  subBalance: CashWalletSubBalance;
  /** Signed paise — credits positive, debits negative. */
  amountPaise: number;
  paymentSource?: CashWalletPaymentSource;
  referenceType?: string;
  referenceId?: string;
  note?: string;
  createdAt: string;
}

export interface CashWallet {
  walletId: string;
  balance: CashWalletBalance;
  recentLedger: CashWalletLedgerEntry[];
}

export interface TopupInitiateInput {
  amountPaise: number;
}

export interface TopupInitiateResponse {
  topupId: string;
  orderId: string;
  amountPaise: number;
  /** Empty when `stubbed` — Razorpay isn't wired yet. */
  razorpayKeyId: string;
  stubbed: boolean;
  message?: string;
}

export interface TopupVerifyInput {
  topupId: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
}

export interface TopupVerifyResponse {
  topupId: string;
  status: 'succeeded';
  alreadyCredited?: boolean;
  stubbed?: boolean;
  paymentId?: string;
}
