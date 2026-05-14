/**
 * Video-verification service — the KYC video-call step. The subject (driver/manager) lists
 * free slots and books one (→ `kyc_status='video_pending'`); an admin runs the call from the
 * console and finalizes it (→ `kyc_status='approved'` on a passing outcome).
 */
import { apiClient } from '@/lib/api/client';
import { toApiFinalizeVideoCall, transformVideoCallSlot, transformVideoVerification } from '@/lib/api/transforms/videoVerification';
import type { FinalizeVideoCallInput, ScheduledVideoCallsQueryParams, VideoCallSlot, VideoVerification } from '@/types';

type Api = Record<string, unknown>;
function unwrap<T>(d: T | null): T {
  if (d === null || d === undefined) throw new Error('video-verifications: empty response body');
  return d;
}

/** Free 15-min slots over the next ~14 days (`GET /video-verifications/available-slots`). */
export function getAvailableVideoSlots(): Promise<VideoCallSlot[]> {
  return apiClient.get<Api[]>('/video-verifications/available-slots').then((r) => (r.data ?? []).map(transformVideoCallSlot));
}
/** Book a slot — subject's `kyc_status` → `video_pending`; returns the row (with the Jitsi meeting URL). */
export function bookVideoCall(slotAt: string): Promise<VideoVerification> {
  return apiClient.post<Api>('/video-verifications', { slot_at: slotAt }).then((r) => transformVideoVerification(unwrap(r.data)));
}
export function getVideoVerification(id: string): Promise<VideoVerification> {
  return apiClient.get<Api>(`/video-verifications/${id}`).then((r) => transformVideoVerification(unwrap(r.data)));
}
/** Cancel a scheduled call (subject or admin) — reverts `kyc_status` to `docs_submitted`. */
export function cancelVideoCall(id: string): Promise<VideoVerification> {
  return apiClient.patch<Api>(`/video-verifications/${id}`, { cancel: true }).then((r) => transformVideoVerification(unwrap(r.data)));
}
/** Move a scheduled call to a different free slot (subject only). */
export function rescheduleVideoCall(id: string, slotAt: string): Promise<VideoVerification> {
  return apiClient.patch<Api>(`/video-verifications/${id}`, { reschedule_to: slotAt }).then((r) => transformVideoVerification(unwrap(r.data)));
}

// ── admin (Video Call Console) ───────────────────────────────────────────────
export function getScheduledVideoCalls(params?: ScheduledVideoCallsQueryParams): Promise<VideoVerification[]> {
  const q: Record<string, unknown> = {};
  if (params?.status?.length) q.status = params.status.join(',');
  if (params?.from) q.from = params.from;
  if (params?.to) q.to = params.to;
  return apiClient.get<Api[]>('/video-verifications', Object.keys(q).length ? q : undefined).then((r) => (r.data ?? []).map(transformVideoVerification));
}
/** Finalize a call — `outcome='approved'` requires all three gates → subject `kyc_status='approved'` + notification. */
export function finalizeVideoCall(id: string, input: FinalizeVideoCallInput): Promise<VideoVerification> {
  return apiClient.patch<Api>(`/video-verifications/${id}/finalize`, toApiFinalizeVideoCall(input)).then((r) => transformVideoVerification(unwrap(r.data)));
}
export function markVideoCallNoShow(id: string): Promise<VideoVerification> {
  return apiClient.patch<Api>(`/video-verifications/${id}`, { no_show: true }).then((r) => transformVideoVerification(unwrap(r.data)));
}
/**
 * Admin-only: flip a video verification's status (or outcome / notes) directly — for
 * off-platform calls, re-opens, manual corrections. Mirrors the subject's `kyc_status`
 * the same way `finalize` does, including auto-promote to `ready_for_approval`.
 */
export interface SetVideoCallStatusInput {
  status?: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  outcome?: 'approved' | 'rejected' | 'resubmit_required' | null;
  notes?: string;
}
export function setVideoCallStatus(id: string, input: SetVideoCallStatusInput): Promise<VideoVerification> {
  const body: Record<string, unknown> = {};
  if (input.status !== undefined) body.status = input.status;
  if (input.outcome !== undefined) body.outcome = input.outcome;
  if (input.notes !== undefined) body.notes = input.notes;
  return apiClient.patch<Api>(`/video-verifications/${id}/status`, body).then((r) => transformVideoVerification(unwrap(r.data)));
}
