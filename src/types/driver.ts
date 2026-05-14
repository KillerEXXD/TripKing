import type { CityRow } from './adminConfig';
import type { NearRadius, Place } from './place';
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
  videoVerification?: { id: string; status: VideoVerificationStatus; scheduledAt: string; meetingUrl: string; outcome?: VideoOutcome } | null;
  kycRejectionReason?: string | null;
}

/**
 * The pre-reveal driver shape returned on public surfaces (`/drivers` list, `/drivers/:id` to a
 * non-revealed viewer, the `driver` field on a vacancy, the `assigned_driver` on a browse-safe
 * trip). Identity (fullName / phone / email / profilePhotoUrl) is absent server-side until the
 * `can_reveal_driver` predicate fires — the client renders by `displayHandle` instead.
 *
 * `Driver` (below) extends this with the revealed identity fields, kept required there because
 * the server only returns the revealed shape to viewers who passed the gate.
 */
export interface DriverPublic {
  id: string;
  userId: string;
  /** Stable opaque per-user identifier (e.g. "A3E5A6E") — always present pre-reveal. */
  displayHandle: string;
  homeCity?: CityRow;
  homePlace?: Place;
  currentCity?: CityRow;
  currentPlace?: Place;
  currentLat?: number;
  currentLng?: number;
  /** Straight-line km from the `?near_*` centre — present only on a radius-filtered `/drivers` list. */
  distanceKm?: number;
  kycStatus: KycStatus;
  ratingAvg: number;
  ratingCount: number;
  ratingDistribution: Record<'1' | '2' | '3' | '4' | '5', number>;
  topTags: string[];
  managerTopTags: string[];
  totalTripsCompleted: number;
  vehicles: VehicleSummary[];
  /** Per-user gate for `POST /bug-reports`. Admins are always allowed regardless. */
  canReportBugs: boolean;
}

/** A driver's revealed marketplace profile (+ owner-only fields when self). */
export interface Driver extends DriverPublic {
  fullName: string;
  phone: string;
  email?: string;
  profilePhotoUrl: string;
  // owner/admin-only (present on GET /drivers/me + admin views)
  verification?: VerificationSummary;
  aadhaarMasked?: string;
  drivingLicenseNumber?: string;
  drivingLicenseExpiry?: string;
}

/** Pre-reveal agent shape (the twin of `DriverPublic`). */
export interface AgentPublic {
  id: string;
  userId: string;
  displayHandle: string;
  businessName?: string;
  businessCity?: CityRow;
  kycStatus: KycStatus;
  topTags: string[];
  totalTripsPosted: number;
  /** Per-user gate for `POST /bug-reports`. Admins are always allowed regardless. */
  canReportBugs: boolean;
}

/** A trip manager (agent) — revealed profile. */
export interface Agent extends AgentPublic {
  fullName: string;
  phone: string;
  email?: string;
  profilePhotoUrl: string;
  // owner/admin-only
  verification?: VerificationSummary;
  aadhaarMasked?: string;
}

export interface DriversQueryParams {
  currentCityId?: string;
  /** Single status or CSV-joined list (e.g. for the KYC "needs review" composite). */
  kycStatus?: KycStatus | KycStatus[];
  /** Admin-only ILIKE match across `full_name | phone | email`. */
  search?: string;
  /** Restrict to drivers whose (fresh) current position is within the radius (nearest first). */
  near?: NearRadius;
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
export interface UpdateAgentInput {
  fullName?: string;
  email?: string;
  businessName?: string;
  businessCityId?: string;
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
