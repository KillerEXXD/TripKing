/** KYC video-call verification — the booking + admin console domain. */

export type VideoVerificationStatus = 'scheduled' | 'completed' | 'failed' | 'cancelled' | 'no_show';
export type VideoOutcome = 'approved' | 'rejected' | 'resubmit_required';

/** A free 15-min slot the subject can book. */
export interface VideoCallSlot {
  slotAt: string; // ISO timestamp
  slotMinutes: number;
}

/** Subject summary embedded in admin console list rows. */
export interface VideoVerificationSubject {
  id: string;
  fullName: string;
  phone: string;
  kycStatus: string;
  cityName?: string;
}

export interface VideoVerification {
  id: string;
  driverId?: string;
  managerId?: string;
  status: VideoVerificationStatus;
  scheduledAt: string;
  slotMinutes: number;
  meetingProvider: string;
  meetingUrl: string;
  conductedBy?: string;
  conductedAt?: string;
  faceMatchConfirmed: boolean;
  documentsConfirmed: boolean;
  livenessCheckPassed: boolean;
  outcome?: VideoOutcome;
  notes?: string;
  /** present on admin console list rows (joined) */
  driver?: VideoVerificationSubject;
  manager?: VideoVerificationSubject;
}

export interface FinalizeVideoCallInput {
  outcome: VideoOutcome;
  faceMatchConfirmed: boolean;
  documentsConfirmed: boolean;
  livenessCheckPassed: boolean;
  notes?: string;
}

export interface ScheduledVideoCallsQueryParams {
  status?: VideoVerificationStatus[];
  /** ISO timestamps */
  from?: string;
  to?: string;
}
