/**
 * Cash Wallet transforms — strict on shape (throws on missing balance fields,
 * which would only happen if the backend regressed). Snake_case → camelCase.
 */
import { ApiTransformError } from '@/lib/api/transforms/base';
import type {
  CashWallet,
  CashWalletBalance,
  CashWalletEntryType,
  CashWalletLedgerEntry,
  CashWalletPaymentSource,
  CashWalletSubBalance,
  TopupInitiateResponse,
  TopupVerifyResponse,
} from '@/types';

export type WalletTransformErrorCode =
  | 'MISSING_WALLET_ID'
  | 'MISSING_BALANCE'
  | 'MISSING_LEDGER_ID'
  | 'BAD_AMOUNT'
  | 'MISSING_TOPUP_ID'
  | 'MISSING_ORDER_ID';
export class WalletTransformError extends ApiTransformError<WalletTransformErrorCode> {}

type Api = Record<string, unknown>;
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}
function reqStr(v: unknown, code: WalletTransformErrorCode, ctx: Api): string {
  const s = str(v);
  if (!s) throw new WalletTransformError(`missing ${code}`, code, ctx);
  return s;
}
function num(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return fallback;
}
function reqNum(v: unknown, code: WalletTransformErrorCode, ctx: Api): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  throw new WalletTransformError(`missing ${code}`, code, ctx);
}

const SUB_BALANCES: CashWalletSubBalance[] = ['promo', 'transferred', 'cash'];
const ENTRY_TYPES: CashWalletEntryType[] = ['topup', 'fee_debit', 'refund', 'transfer_in_from_referral', 'promo_credit_grant', 'adjustment'];
const PAYMENT_SOURCES: CashWalletPaymentSource[] = ['direct_upi', 'direct_card', 'promo_credit', 'earnings_transfer_credit', 'admin_bonus', 'coupon'];

function subBalance(v: unknown, ctx: Api): CashWalletSubBalance {
  if (typeof v === 'string' && (SUB_BALANCES as string[]).includes(v)) return v as CashWalletSubBalance;
  throw new WalletTransformError('bad sub_balance', 'BAD_AMOUNT', { v, ...ctx });
}
function entryType(v: unknown): CashWalletEntryType {
  return typeof v === 'string' && (ENTRY_TYPES as string[]).includes(v) ? (v as CashWalletEntryType) : 'adjustment';
}
function paymentSource(v: unknown): CashWalletPaymentSource | undefined {
  return typeof v === 'string' && (PAYMENT_SOURCES as string[]).includes(v) ? (v as CashWalletPaymentSource) : undefined;
}

export function transformBalance(api: Api): CashWalletBalance {
  if (!api || typeof api !== 'object') throw new WalletTransformError('missing balance', 'MISSING_BALANCE', { api });
  return {
    promoPaise: reqNum(api.promo_paise, 'BAD_AMOUNT', { field: 'promo_paise' }),
    transferredPaise: reqNum(api.transferred_paise, 'BAD_AMOUNT', { field: 'transferred_paise' }),
    cashPaise: reqNum(api.cash_paise, 'BAD_AMOUNT', { field: 'cash_paise' }),
    totalPaise: reqNum(api.total_paise, 'BAD_AMOUNT', { field: 'total_paise' }),
  };
}

export function transformLedgerEntry(api: Api): CashWalletLedgerEntry {
  const id = reqStr(api.id, 'MISSING_LEDGER_ID', { api });
  return {
    id,
    entryType: entryType(api.entry_type),
    subBalance: subBalance(api.sub_balance, { id }),
    amountPaise: num(api.amount_paise, 0),
    paymentSource: paymentSource(api.payment_source),
    referenceType: str(api.reference_type),
    referenceId: str(api.reference_id),
    note: str(api.note),
    createdAt: str(api.created_at) ?? '',
  };
}

export function transformWallet(api: Api): CashWallet {
  const walletId = reqStr(api.wallet_id, 'MISSING_WALLET_ID', { api });
  const balance = transformBalance((api.balance as Api) ?? {});
  const ledgerArr = Array.isArray(api.recent_ledger) ? (api.recent_ledger as Api[]) : [];
  return { walletId, balance, recentLedger: ledgerArr.map(transformLedgerEntry) };
}

export function transformTopupInitiate(api: Api): TopupInitiateResponse {
  return {
    topupId: reqStr(api.topup_id, 'MISSING_TOPUP_ID', { api }),
    orderId: reqStr(api.order_id, 'MISSING_ORDER_ID', { api }),
    amountPaise: reqNum(api.amount_paise, 'BAD_AMOUNT', { api }),
    razorpayKeyId: str(api.razorpay_key_id) ?? '',
    stubbed: api.stubbed === true,
    message: str(api.message),
  };
}

export function transformTopupVerify(api: Api): TopupVerifyResponse {
  return {
    topupId: reqStr(api.topup_id, 'MISSING_TOPUP_ID', { api }),
    status: 'succeeded',
    alreadyCredited: api.already_credited === true,
    stubbed: api.stubbed === true,
    paymentId: str(api.payment_id),
  };
}
