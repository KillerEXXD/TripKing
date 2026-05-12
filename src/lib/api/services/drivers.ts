/**
 * Drivers + agents service — public profiles, "create my profile" (`POST /drivers`,
 * the one cross-lane contract), and owner-only updates.
 * (The `/drivers/*` GET/PATCH and `/agents/*` edge functions land with the backend lane.)
 */
import { apiClient, EmptyResponseError } from '@/lib/api/client';
import {
  toApiCreateAgentProfile,
  toApiCreateDriverProfile,
  toApiSubmitAgentKycDocs,
  toApiSubmitDriverKycDocs,
  toApiUpdateDriver,
  toApiUpdateLocation,
  transformAgent,
  transformDriver,
  transformKycDocs,
  transformUploadUrl,
} from '@/lib/api/transforms/driver';
import type {
  Agent,
  AgentKycDocType,
  CreateAgentProfileInput,
  CreateDriverProfileInput,
  Driver,
  DriverKycDocType,
  DriversQueryParams,
  KycDocs,
  KycStatus,
  SubmitAgentKycDocsInput,
  SubmitDriverKycDocsInput,
  UpdateDriverInput,
  UpdateLocationInput,
  UploadUrlResponse,
} from '@/types';

type Api = Record<string, unknown>;
function unwrap<T>(d: T | null): T {
  if (d === null || d === undefined) throw new EmptyResponseError('drivers');
  return d;
}

/** Create the signed-in user's driver profile (`POST /drivers`, `role:'driver'`; `user_id = auth.uid()`). */
export function createMyDriverProfile(input: CreateDriverProfileInput): Promise<Driver> {
  return apiClient.post<Api>('/drivers', toApiCreateDriverProfile(input)).then((r) => transformDriver(unwrap(r.data)));
}
/** Create the signed-in user's agent (trip_manager) profile (`POST /drivers`, `role:'trip_manager'`). */
export function createMyAgentProfile(input: CreateAgentProfileInput): Promise<Agent> {
  return apiClient.post<Api>('/drivers', toApiCreateAgentProfile(input)).then((r) => transformAgent(unwrap(r.data)));
}

export function getDrivers(params?: DriversQueryParams): Promise<Driver[]> {
  const q: Record<string, unknown> = {};
  if (params?.currentCityId) q.current_city_id = params.currentCityId;
  if (params?.kycStatus) q.kyc_status = params.kycStatus;
  if (params?.near) {
    q.near_lat = params.near.lat;
    q.near_lng = params.near.lng;
    q.radius_km = params.near.radiusKm;
  }
  if (params?.page) q.page = params.page;
  if (params?.limit) q.limit = params.limit;
  if (params?.sort) q.sort = params.sort;
  return apiClient.get<Api[]>('/drivers', Object.keys(q).length ? q : undefined).then((r) => (r.data ?? []).map(transformDriver));
}
export function getDriver(id: string): Promise<Driver> {
  return apiClient.get<Api>(`/drivers/${id}`).then((r) => transformDriver(unwrap(r.data)));
}
/** The signed-in user's own driver profile (`GET /drivers/me`; throws an `ApiError` 404 if they don't have one). */
export function getMyDriver(): Promise<Driver> {
  return apiClient.get<Api>('/drivers/me').then((r) => transformDriver(unwrap(r.data)));
}
export function updateDriver(id: string, input: UpdateDriverInput): Promise<Driver> {
  return apiClient.patch<Api>(`/drivers/${id}`, toApiUpdateDriver(input)).then((r) => transformDriver(unwrap(r.data)));
}
export function updateDriverLocation(id: string, input: UpdateLocationInput): Promise<Driver> {
  return apiClient.patch<Api>(`/drivers/${id}/location`, toApiUpdateLocation(input)).then((r) => transformDriver(unwrap(r.data)));
}
/** Admin KYC workflow transition for a driver (`PATCH /drivers/:id/kyc`). */
export function updateDriverKyc(id: string, kycStatus: KycStatus, note?: string): Promise<Driver> {
  return apiClient.patch<Api>(`/drivers/${id}/kyc`, { kyc_status: kycStatus, ...(note ? { note } : {}) }).then((r) => transformDriver(unwrap(r.data)));
}

export interface AgentsQueryParams {
  businessCityId?: string;
  kycStatus?: KycStatus;
  limit?: number;
}
export function getAgents(params?: AgentsQueryParams): Promise<Agent[]> {
  const q: Record<string, unknown> = {};
  if (params?.businessCityId) q.business_city_id = params.businessCityId;
  if (params?.kycStatus) q.kyc_status = params.kycStatus;
  if (params?.limit) q.limit = params.limit;
  return apiClient.get<Api[]>('/agents', Object.keys(q).length ? q : undefined).then((r) => (r.data ?? []).map(transformAgent));
}
export function getAgent(id: string): Promise<Agent> {
  return apiClient.get<Api>(`/agents/${id}`).then((r) => transformAgent(unwrap(r.data)));
}
/** The signed-in user's own agent profile (`GET /agents/me`; throws an `ApiError` 404 if they don't have one). */
export function getMyAgent(): Promise<Agent> {
  return apiClient.get<Api>('/agents/me').then((r) => transformAgent(unwrap(r.data)));
}
/** Admin KYC workflow transition for an agent (`PATCH /agents/:id/kyc`). */
export function updateAgentKyc(id: string, kycStatus: KycStatus, note?: string): Promise<Agent> {
  return apiClient.patch<Api>(`/agents/${id}/kyc`, { kyc_status: kycStatus, ...(note ? { note } : {}) }).then((r) => transformAgent(unwrap(r.data)));
}
export function updateAgent(
  id: string,
  input: { fullName?: string; email?: string; businessName?: string; businessCityId?: string; profilePhotoUrl?: string },
): Promise<Agent> {
  const body: Record<string, unknown> = {};
  if (input.fullName !== undefined) body.full_name = input.fullName;
  if (input.email !== undefined) body.email = input.email;
  if (input.businessName !== undefined) body.business_name = input.businessName;
  if (input.businessCityId !== undefined) body.business_city_id = input.businessCityId;
  if (input.profilePhotoUrl !== undefined) body.profile_photo_url = input.profilePhotoUrl;
  return apiClient.patch<Api>(`/agents/${id}`, body).then((r) => transformAgent(unwrap(r.data)));
}

// ── KYC documents (driver) ───────────────────────────────────────────────────
/** Mint a short-lived signed PUT URL for one driver KYC doc (`POST /drivers/:id/kyc-doc-upload-url`). */
export function getDriverKycDocUploadUrl(driverId: string, docType: DriverKycDocType): Promise<UploadUrlResponse> {
  return apiClient.post<Api>(`/drivers/${driverId}/kyc-doc-upload-url`, { doc_type: docType }).then((r) => transformUploadUrl(unwrap(r.data)));
}
/** Submit all KYC docs → `kyc_status` pending|resubmit_required → docs_submitted (`POST /drivers/:id/kyc-docs`). */
export function submitDriverKycDocs(driverId: string, input: SubmitDriverKycDocsInput): Promise<Driver> {
  return apiClient.post<Api>(`/drivers/${driverId}/kyc-docs`, toApiSubmitDriverKycDocs(input)).then((r) => transformDriver(unwrap(r.data)));
}
/** Masked numbers + 5-min signed download URLs for a driver's KYC docs (owner/admin; `GET /drivers/:id/kyc-docs`). */
export function getDriverKycDocs(driverId: string): Promise<KycDocs> {
  return apiClient.get<Api>(`/drivers/${driverId}/kyc-docs`).then((r) => transformKycDocs(unwrap(r.data)));
}

// ── KYC documents (agent / trip-manager) ─────────────────────────────────────
export function getAgentKycDocUploadUrl(agentId: string, docType: AgentKycDocType): Promise<UploadUrlResponse> {
  return apiClient.post<Api>(`/agents/${agentId}/kyc-doc-upload-url`, { doc_type: docType }).then((r) => transformUploadUrl(unwrap(r.data)));
}
export function submitAgentKycDocs(agentId: string, input: SubmitAgentKycDocsInput): Promise<Agent> {
  return apiClient.post<Api>(`/agents/${agentId}/kyc-docs`, toApiSubmitAgentKycDocs(input)).then((r) => transformAgent(unwrap(r.data)));
}
export function getAgentKycDocs(agentId: string): Promise<KycDocs> {
  return apiClient.get<Api>(`/agents/${agentId}/kyc-docs`).then((r) => transformKycDocs(unwrap(r.data)));
}
