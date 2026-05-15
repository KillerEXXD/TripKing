/** Cash Wallet service — Stage 2 of the referral program. */
import { apiClient, EmptyResponseError } from '@/lib/api/client';
import {
  transformLedgerEntry,
  transformTopupInitiate,
  transformTopupVerify,
  transformWallet,
} from '@/lib/api/transforms/wallet';
import type {
  CashWallet,
  CashWalletLedgerEntry,
  TopupInitiateInput,
  TopupInitiateResponse,
  TopupVerifyInput,
  TopupVerifyResponse,
} from '@/types';

type Api = Record<string, unknown>;
function unwrap<T>(d: T | null): T {
  if (d === null || d === undefined) throw new EmptyResponseError('wallet');
  return d;
}

export function getWallet(): Promise<CashWallet> {
  return apiClient.get<Api>('/wallet').then((r) => transformWallet(unwrap(r.data)));
}

export function getWalletLedger(params?: { limit?: number; before?: string }): Promise<CashWalletLedgerEntry[]> {
  const q: Record<string, unknown> = {};
  if (params?.limit) q.limit = params.limit;
  if (params?.before) q.before = params.before;
  return apiClient.get<Api[]>('/wallet/ledger', Object.keys(q).length ? q : undefined).then((r) => (r.data ?? []).map(transformLedgerEntry));
}

export function initiateTopup(input: TopupInitiateInput): Promise<TopupInitiateResponse> {
  return apiClient.post<Api>('/wallet/topup/initiate', { amount_paise: input.amountPaise }).then((r) => transformTopupInitiate(unwrap(r.data)));
}

export function verifyTopup(input: TopupVerifyInput): Promise<TopupVerifyResponse> {
  const body: Record<string, unknown> = { topup_id: input.topupId };
  if (input.razorpayPaymentId) body.razorpay_payment_id = input.razorpayPaymentId;
  if (input.razorpaySignature) body.razorpay_signature = input.razorpaySignature;
  return apiClient.post<Api>('/wallet/topup/verify', body).then((r) => transformTopupVerify(unwrap(r.data)));
}
