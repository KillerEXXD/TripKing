/** Vehicles service — a driver's cars (owner-managed; readable by all). */
import { apiClient } from '@/lib/api/client';
import { toApiVehicle, transformVehicle } from '@/lib/api/transforms/vehicle';
import type { Vehicle, VehicleInput } from '@/types';

type Api = Record<string, unknown>;
function unwrap<T>(d: T | null): T {
  if (d === null || d === undefined) throw new Error('vehicles: empty response body');
  return d;
}

export function getDriverVehicles(driverId: string): Promise<Vehicle[]> {
  return apiClient.get<Api[]>('/vehicles', { driver_id: driverId }).then((r) => (r.data ?? []).map(transformVehicle));
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
