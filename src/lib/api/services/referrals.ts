/** Referral dashboard service — Stage 4 of the referral program. */
import { apiClient, EmptyResponseError } from '@/lib/api/client';
import {
  transformReferralDashboard,
  transformReferralEarnings,
  transformReferralLink,
} from '@/lib/api/transforms/referral';
import type { ReferralDashboard, ReferralEarningsSeries, ReferralLink } from '@/types';

type Api = Record<string, unknown>;
function unwrap<T>(d: T | null): T {
  if (d === null || d === undefined) throw new EmptyResponseError('referrals');
  return d;
}

export function getMyReferralDashboard(): Promise<ReferralDashboard> {
  return apiClient.get<Api>('/referrals/me').then((r) => transformReferralDashboard(unwrap(r.data)));
}

export function getMyReferred(params?: { status?: string; role?: 'driver' | 'trip_manager' }): Promise<ReferralLink[]> {
  const q: Record<string, unknown> = {};
  if (params?.status) q.status = params.status;
  if (params?.role) q.role = params.role;
  return apiClient.get<Api[]>('/referrals/me/referred', Object.keys(q).length ? q : undefined).then((r) => (r.data ?? []).map(transformReferralLink));
}

export function getMyReferralEarnings(params?: { from?: string; to?: string }): Promise<ReferralEarningsSeries> {
  const q: Record<string, unknown> = {};
  if (params?.from) q.from = params.from;
  if (params?.to) q.to = params.to;
  return apiClient.get<Api>('/referrals/me/earnings', Object.keys(q).length ? q : undefined).then((r) => transformReferralEarnings(unwrap(r.data)));
}
