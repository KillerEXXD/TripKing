/**
 * Referral transforms — Stage 1. Lenient on absence (the backend Stage 1 PR may
 * not be deployed yet for every environment), strict on shape: if the API does
 * send a `referral_summary` block, the numeric fields must be numbers — we never
 * fabricate referral counts client-side.
 */
import { ApiTransformError } from '@/lib/api/transforms/base';
import type { ReferralSummary } from '@/types';

export type ReferralTransformErrorCode = 'BAD_TOTAL_REFERRED' | 'BAD_TOTAL_EARNINGS';
export class ReferralTransformError extends ApiTransformError<ReferralTransformErrorCode> {}

type Api = Record<string, unknown>;

function reqNum(v: unknown, code: ReferralTransformErrorCode, ctx: Api): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  throw new ReferralTransformError(`missing ${code}`, code, ctx);
}

/** `null`/`undefined` → `undefined`; otherwise validate every numeric field. */
export function transformReferralSummary(v: unknown): ReferralSummary | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v !== 'object') return undefined;
  const o = v as Api;
  return {
    totalReferred: reqNum(o.total_referred, 'BAD_TOTAL_REFERRED', { o }),
    totalEarningsPaise: reqNum(o.total_earnings_paise, 'BAD_TOTAL_EARNINGS', { o }),
  };
}
