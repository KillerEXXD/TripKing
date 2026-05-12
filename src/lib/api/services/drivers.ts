/**
 * Drivers + agents service — public profiles + owner-only updates.
 * (The matching `/drivers/*` and `/agents/*` edge functions land later.)
 */
import { apiClient } from '@/lib/api/client';
import { toApiUpdateDriver, toApiUpdateLocation, transformAgent, transformDriver } from '@/lib/api/transforms/driver';
import type { Agent, Driver, DriversQueryParams, UpdateDriverInput, UpdateLocationInput } from '@/types';

type Api = Record<string, unknown>;
function unwrap<T>(d: T | null): T {
  if (d === null || d === undefined) throw new Error('drivers: empty response body');
  return d;
}

export function getDrivers(params?: DriversQueryParams): Promise<Driver[]> {
  const q: Record<string, unknown> = {};
  if (params?.currentCityId) q.current_city_id = params.currentCityId;
  if (params?.kycStatus) q.kyc_status = params.kycStatus;
  if (params?.page) q.page = params.page;
  if (params?.limit) q.limit = params.limit;
  if (params?.sort) q.sort = params.sort;
  return apiClient.get<Api[]>('/drivers', Object.keys(q).length ? q : undefined).then((r) => (r.data ?? []).map(transformDriver));
}
export function getDriver(id: string): Promise<Driver> {
  return apiClient.get<Api>(`/drivers/${id}`).then((r) => transformDriver(unwrap(r.data)));
}
export function updateDriver(id: string, input: UpdateDriverInput): Promise<Driver> {
  return apiClient.patch<Api>(`/drivers/${id}`, toApiUpdateDriver(input)).then((r) => transformDriver(unwrap(r.data)));
}
export function updateDriverLocation(id: string, input: UpdateLocationInput): Promise<Driver> {
  return apiClient.patch<Api>(`/drivers/${id}/location`, toApiUpdateLocation(input)).then((r) => transformDriver(unwrap(r.data)));
}

export function getAgent(id: string): Promise<Agent> {
  return apiClient.get<Api>(`/agents/${id}`).then((r) => transformAgent(unwrap(r.data)));
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
