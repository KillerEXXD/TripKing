/** Video-verification transforms — strict on id/scheduled_at; subjects joined server-side. */
import type {
  FinalizeVideoCallInput, VideoCallSlot, VideoOutcome, VideoVerification, VideoVerificationStatus, VideoVerificationSubject,
} from '@/types';

export type VideoVerificationTransformErrorCode = 'MISSING_ID' | 'MISSING_SCHEDULED_AT';
export class VideoVerificationTransformError extends Error {
  constructor(message: string, public code: VideoVerificationTransformErrorCode, public context: Record<string, unknown> = {}) {
    super(message);
    this.name = 'VideoVerificationTransformError';
  }
}

type Api = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const reqStr = (v: unknown, code: VideoVerificationTransformErrorCode, ctx: Api): string => {
  const s = str(v);
  if (!s) throw new VideoVerificationTransformError(`missing ${code}`, code, ctx);
  return s;
};
const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : fallback;
const bool = (v: unknown): boolean => v === true;

const STATUSES: VideoVerificationStatus[] = ['scheduled', 'completed', 'failed', 'cancelled', 'no_show'];
const OUTCOMES: VideoOutcome[] = ['approved', 'rejected', 'resubmit_required'];
const status = (v: unknown): VideoVerificationStatus =>
  typeof v === 'string' && (STATUSES as string[]).includes(v) ? (v as VideoVerificationStatus) : 'scheduled';
const outcome = (v: unknown): VideoOutcome | undefined =>
  typeof v === 'string' && (OUTCOMES as string[]).includes(v) ? (v as VideoOutcome) : undefined;

function subject(v: unknown): VideoVerificationSubject | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Api;
  const id = str(o.id);
  if (!id) return undefined;
  const city = (o.home_city ?? o.business_city) as Api | undefined;
  return {
    id,
    fullName: str(o.full_name) ?? '',
    phone: str(o.phone) ?? '',
    kycStatus: str(o.kyc_status) ?? 'pending',
    cityName: str(city?.name),
  };
}

export function transformVideoVerification(api: Api): VideoVerification {
  const id = reqStr(api.id, 'MISSING_ID', { api });
  const ctx = { video_verification_id: id };
  return {
    id,
    driverId: str(api.driver_id),
    managerId: str(api.manager_id),
    status: status(api.status),
    scheduledAt: reqStr(api.scheduled_at, 'MISSING_SCHEDULED_AT', ctx),
    slotMinutes: num(api.slot_minutes, 15),
    meetingProvider: str(api.meeting_provider) ?? 'jitsi',
    meetingUrl: str(api.meeting_url) ?? '',
    conductedBy: str(api.conducted_by),
    conductedAt: str(api.conducted_at),
    faceMatchConfirmed: bool(api.face_match_confirmed),
    documentsConfirmed: bool(api.documents_confirmed),
    livenessCheckPassed: bool(api.liveness_check_passed),
    outcome: outcome(api.outcome),
    notes: str(api.notes),
    driver: subject(api.driver),
    manager: subject(api.manager),
  };
}

export function transformVideoCallSlot(api: Api): VideoCallSlot {
  return { slotAt: str(api.slot_at) ?? '', slotMinutes: num(api.slot_minutes, 15) };
}

export function toApiFinalizeVideoCall(input: FinalizeVideoCallInput): Record<string, unknown> {
  const out: Record<string, unknown> = {
    outcome: input.outcome,
    face_match_confirmed: input.faceMatchConfirmed,
    documents_confirmed: input.documentsConfirmed,
    liveness_check_passed: input.livenessCheckPassed,
  };
  if (input.notes) out.notes = input.notes;
  return out;
}
