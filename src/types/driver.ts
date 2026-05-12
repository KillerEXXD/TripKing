import type { CityRow } from './adminConfig';
import type { VehicleSummary } from './trip';
import type { VideoOutcome, VideoVerificationStatus } from './videoVerification';

export type KycStatus = 'pending' | 'docs_submitted' | 'video_pending' | 'approved' | 'rejected' | 'resubmit_required';

/** Status of one onboarding/verification step (the server-computed checklist). */
export type VerificationStepStatus = 'todo' | 'done' | 'action_needed' | 'scheduled';
export type DriverVerificationStepKey = 'details' | 'documents' | 'vehicle' | 'vehicle_photos' | 'video_call';
export type AgentVerificationStepKey = 'details' | 'documents' | 'video_call';

/** Server-computed verification summary attached to `GET /drivers|agents/me` (and admin views). */
export interface VerificationSummary {
  kycStatus: KycStatus;
  /** keys are DriverVerificationStepKey (5) for drivers, AgentVerificationStepKey (3) for agents. */
  steps: Partial<Record<DriverVerificationStepKey, VerificationStepStatus>>;
  stepsDone: number;
  stepsTotal: number;
  videoVerification?: { id: string; status: VideoVerificationStatus; scheduledAt?: string; meetingUrl?: string; outcome?: VideoOutcome } | null;
  kycRejectionReason?: string | null;
}

/** A driver's public marketplace profile (+ owner-only fields when self). */
export interface Driver {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  email?: string;
  homeCity?: CityRow;
  currentCity?: CityRow;
  currentLat?: number;
  currentLng?: number;
  profilePhotoUrl: string;
  kycStatus: KycStatus;
  ratingAvg: number;
  ratingCount: number;
  ratingDistribution: Record<'1' | '2' | '3' | '4' | '5', number>;
  /** top positive passenger→driver tags. */
  topTags: string[];
  /** top positive agent→driver tags. */
  managerTopTags: string[];
  totalTripsCompleted: number;
  vehicles: VehicleSummary[];
  // owner/admin-only (present on GET /drivers/me + admin views)
  verification?: VerificationSummary;
  aadhaarMasked?: string;
  drivingLicenseNumber?: string;
  drivingLicenseExpiry?: string;
}

/** A trip manager (agent) — public profile. */
export interface Agent {
  id: string;
  userId: string;
  fullName: string;
  phone: string;
  email?: string;
  businessName?: string;
  businessCity?: CityRow;
  profilePhotoUrl: string;
  kycStatus: KycStatus;
  topTags: string[];
  totalTripsPosted: number;
  // owner/admin-only
  verification?: VerificationSummary;
  aadhaarMasked?: string;
}

export interface DriversQueryParams {
  currentCityId?: string;
  kycStatus?: KycStatus;
  page?: number;
  limit?: number;
  sort?: string;
}
export interface UpdateDriverInput {
  fullName?: string;
  email?: string;
  homeCityId?: string;
  currentCityId?: string;
  profilePhotoUrl?: string;
}

/**
 * Body for "create my driver profile" — `POST /drivers` with `role:'driver'`
 * (`driver_id` auto, `user_id = auth.uid()`). The cross-lane contract; see
 * `docs/CONTINUE_HERE_BACKEND.md`. `role` is set by the service fn, not the caller.
 */
export interface CreateDriverProfileInput {
  fullName: string;
  homeCityId: string;
  email?: string;
}

/**
 * Body for "create my agent profile" — `POST /drivers` with `role:'trip_manager'`
 * (the route writes a `trip_managers` row). The agent's city is `business_city_id`.
 */
export interface CreateAgentProfileInput {
  fullName: string;
  businessCityId: string;
  email?: string;
  businessName?: string;
}
export interface UpdateLocationInput {
  cityId?: string;
  lat?: number;
  lng?: number;
}

// ── KYC document upload ──────────────────────────────────────────────────────
export type DriverKycDocType = 'aadhaar_front' | 'aadhaar_back' | 'driver_license' | 'selfie';
export type AgentKycDocType = 'aadhaar_front' | 'aadhaar_back' | 'selfie';

/** Response of the *-doc-upload-url / *-photo-upload-url endpoints — a short-lived signed PUT URL. */
export interface UploadUrlResponse {
  bucket: string;
  path: string;
  signedUrl: string;
  token: string;
  /** the DB column the resulting `path` should be stored into (vehicle photos: `column`; kyc docs: `path_col`). */
  column?: string;
}

export interface SubmitDriverKycDocsInput {
  aadhaarFrontPath: string;
  aadhaarBackPath: string;
  aadhaarLast4: string;
  driverLicensePath: string;
  driverLicenseNumber: string;
  driverLicenseExpiry?: string;
  selfiePath: string;
  consent: boolean;
}
export interface SubmitAgentKycDocsInput {
  aadhaarFrontPath: string;
  aadhaarBackPath: string;
  aadhaarLast4: string;
  selfiePath: string;
  consent: boolean;
}

/** `GET /drivers|agents/:id/kyc-docs` — masked numbers + 5-min signed download URLs. */
export interface KycDocs {
  aadhaarNumberMasked?: string;
  driverLicenseNumber?: string; // driver only
  driverLicenseExpiry?: string; // driver only
  kycDocsSubmittedAt?: string;
  aadhaarFrontUrl?: string;
  aadhaarBackUrl?: string;
  driverLicenseUrl?: string; // driver only
  selfieUrl?: string;
}
