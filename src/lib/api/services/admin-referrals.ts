/**
 * Stage 9 — admin endpoints for referral fraud / ops:
 *   GET    /admin/referrals
 *   PATCH  /admin/referrals/:id/status
 *   POST   /admin/referrals/:id/reverse-earnings
 *   GET    /admin/referrals/flags
 *   POST   /admin/referrals/flags
 *   PATCH  /admin/referrals/flags/:id
 *   PATCH  /admin/users/:id/risk
 *
 * Untyped pass-through rows for now; transforms can land per-table when the FE
 * needs to read specific fields.
 */
import { apiClient, EmptyResponseError } from '@/lib/api/client';
import { transformReferralLink } from '@/lib/api/transforms/referral';
import type { ReferralLink, ReferralLinkStatus } from '@/types';

type Row = Record<string, unknown>;
function unwrap<T>(d: T | null): T {
  if (d === null || d === undefined) throw new EmptyResponseError('admin-referrals');
  return d;
}

export interface AdminReferralsListParams {
  status?: ReferralLinkStatus;
  referrerUserId?: string;
  referredUserId?: string;
  limit?: number;
}

export function getAdminReferrals(params?: AdminReferralsListParams): Promise<ReferralLink[]> {
  const q: Row = {};
  if (params?.status) q.status = params.status;
  if (params?.referrerUserId) q.referrer_user_id = params.referrerUserId;
  if (params?.referredUserId) q.referred_user_id = params.referredUserId;
  if (params?.limit) q.limit = params.limit;
  return apiClient.get<Row[]>('/admin/referrals', Object.keys(q).length ? q : undefined).then((r) => (r.data ?? []).map(transformReferralLink));
}

export function patchAdminReferralStatus(linkId: string, status: ReferralLinkStatus, note?: string): Promise<ReferralLink> {
  const body: Row = { status };
  if (note) body.note = note;
  return apiClient.patch<Row>(`/admin/referrals/${linkId}/status`, body).then((r) => transformReferralLink(unwrap(r.data)));
}

export interface ReverseEarningsResult {
  reversedPaise: number;
  link?: ReferralLink;
}
export function reverseAdminReferralEarnings(linkId: string, note?: string): Promise<ReverseEarningsResult> {
  return apiClient.post<Row>(`/admin/referrals/${linkId}/reverse-earnings`, note ? { note } : {}).then((r) => {
    const row = unwrap(r.data);
    const linkRaw = row.link && typeof row.link === 'object' ? (row.link as Row) : null;
    return {
      reversedPaise: Number(row.reversed_paise ?? 0),
      link: linkRaw ? transformReferralLink(linkRaw) : undefined,
    };
  });
}

// ── Fraud flags ─────────────────────────────────────────────────────────────

export type FraudSeverity = 'low' | 'medium' | 'high';
export type FraudFlagType =
  | 'duplicate_aadhaar' | 'duplicate_upi' | 'repeated_pair' | 'device_fingerprint'
  | 'velocity_signups' | 'velocity_completions' | 'manual';

export interface FraudFlag {
  id: string;
  referralLinkId: string;
  flagType: string;
  severity: string;
  autoDetected: boolean;
  actionTaken?: string;
  detail?: Row;
  note?: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolvedNote?: string;
}

function transformFlag(api: Row): FraudFlag {
  return {
    id: String(api.id ?? ''),
    referralLinkId: String(api.referral_link_id ?? ''),
    flagType: String(api.flag_type ?? ''),
    severity: String(api.severity ?? ''),
    autoDetected: !!api.auto_detected,
    actionTaken: typeof api.action_taken === 'string' ? api.action_taken : undefined,
    detail: api.detail && typeof api.detail === 'object' ? (api.detail as Row) : undefined,
    note: typeof api.note === 'string' ? api.note : undefined,
    createdAt: String(api.created_at ?? ''),
    resolvedAt: typeof api.resolved_at === 'string' ? api.resolved_at : undefined,
    resolvedBy: typeof api.resolved_by === 'string' ? api.resolved_by : undefined,
    resolvedNote: typeof api.resolved_note === 'string' ? api.resolved_note : undefined,
  };
}

export interface AdminFlagsListParams {
  resolved?: boolean;
  severity?: FraudSeverity;
  flagType?: FraudFlagType;
  limit?: number;
}

export function getAdminFraudFlags(params?: AdminFlagsListParams): Promise<FraudFlag[]> {
  const q: Row = {};
  if (params?.resolved !== undefined) q.resolved = String(params.resolved);
  if (params?.severity) q.severity = params.severity;
  if (params?.flagType) q.flag_type = params.flagType;
  if (params?.limit) q.limit = params.limit;
  return apiClient.get<Row[]>('/admin/referrals/flags', Object.keys(q).length ? q : undefined).then((r) => (r.data ?? []).map(transformFlag));
}

export function createAdminFraudFlag(input: { referralLinkId: string; flagType: FraudFlagType; severity: FraudSeverity; note?: string }): Promise<FraudFlag> {
  const body: Row = { referral_link_id: input.referralLinkId, flag_type: input.flagType, severity: input.severity };
  if (input.note) body.note = input.note;
  return apiClient.post<Row>('/admin/referrals/flags', body).then((r) => transformFlag(unwrap(r.data)));
}

export function resolveAdminFraudFlag(id: string, resolvedNote?: string): Promise<FraudFlag> {
  return apiClient.patch<Row>(`/admin/referrals/flags/${id}`, resolvedNote ? { resolved_note: resolvedNote } : {}).then((r) => transformFlag(unwrap(r.data)));
}

// ── User risk ───────────────────────────────────────────────────────────────

export type RiskLevel = 'normal' | 'elevated' | 'blocked';

export function patchUserRisk(userId: string, risk: RiskLevel, note?: string): Promise<Row> {
  const body: Row = { risk };
  if (note) body.note = note;
  return apiClient.patch<Row>(`/admin/users/${userId}/risk`, body).then((r) => unwrap(r.data));
}
