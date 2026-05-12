/** Vehicles service — a driver's cars (owner-managed; readable by all). */
import { apiClient } from '@/lib/api/client';
import { transformUploadUrl } from '@/lib/api/transforms/driver';
import { toApiVehicle, transformVehicle } from '@/lib/api/transforms/vehicle';
import type { EligibilityStatus, UploadUrlResponse, Vehicle, VehicleInput, VehiclePhotoSlot } from '@/types';

type Api = Record<string, unknown>;
function unwrap<T>(d: T | null): T {
  if (d === null || d === undefined) throw new Error('vehicles: empty response body');
  return d;
}

export function getDriverVehicles(driverId: string): Promise<Vehicle[]> {
  return apiClient.get<Api[]>('/vehicles', { driver_id: driverId }).then((r) => (r.data ?? []).map(transformVehicle));
}

export interface AdminVehiclesQueryParams {
  /** CSV of eligible | expiring_soon | expired. */
  eligibility?: EligibilityStatus[];
  /** `true` ⇒ only vehicles whose eligibility ≠ eligible (the admin dashboard). */
  needsAttention?: boolean;
  includeInactive?: boolean;
}
/** Admin eligibility dashboard — vehicles across all drivers (server-derived `eligibilityStatus`). */
export function getAdminVehicles(params?: AdminVehiclesQueryParams): Promise<Vehicle[]> {
  const q: Record<string, unknown> = {};
  if (params?.eligibility?.length) q.eligibility = params.eligibility.join(',');
  if (params?.needsAttention) q.needs_attention = true;
  if (params?.includeInactive) q.include_inactive = true;
  return apiClient.get<Api[]>('/vehicles', Object.keys(q).length ? q : undefined).then((r) => (r.data ?? []).map(transformVehicle));
}
export function getVehicle(id: string): Promise<Vehicle> {
  return apiClient.get<Api>(`/vehicles/${id}`).then((r) => transformVehicle(unwrap(r.data)));
}
export function addVehicle(input: VehicleInput): Promise<Vehicle> {
  return apiClient.post<Api>('/vehicles', toApiVehicle(input)).then((r) => transformVehicle(unwrap(r.data)));
}
export function updateVehicle(id: string, patch: Partial<VehicleInput>): Promise<Vehicle> {
  return apiClient.patch<Api>(`/vehicles/${id}`, toApiVehicle(patch)).then((r) => transformVehicle(unwrap(r.data)));
}
export function setVehicleActive(id: string, isActive: boolean): Promise<Vehicle> {
  return apiClient.patch<Api>(`/vehicles/${id}`, { is_active: isActive }).then((r) => transformVehicle(unwrap(r.data)));
}
export function deleteVehicle(id: string): Promise<void> {
  return apiClient.delete<unknown>(`/vehicles/${id}`).then(() => undefined);
}
/** Mint a short-lived signed PUT URL for one vehicle photo/document slot (`POST /vehicles/:id/photo-upload-url`). */
export function getVehiclePhotoUploadUrl(vehicleId: string, slot: VehiclePhotoSlot): Promise<UploadUrlResponse> {
  return apiClient.post<Api>(`/vehicles/${vehicleId}/photo-upload-url`, { slot }).then((r) => transformUploadUrl(unwrap(r.data)));
}
