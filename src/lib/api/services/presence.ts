/** Driver presence + public platform config — the "I'm Online" data layer. */
import { apiClient, EmptyResponseError } from '@/lib/api/client';
import { transformPlatformConfig, transformPresence } from '@/lib/api/transforms/presence';
import type { DriverPresence, GoOnlineInput, PlatformConfig } from '@/types';

type Api = Record<string, unknown>;
function unwrap<T>(d: T | null): T {
  if (d === null || d === undefined) throw new EmptyResponseError('presence');
  return d;
}

export const getPlatformConfig = (): Promise<PlatformConfig> =>
  apiClient.get<Api>('/config').then((r) => transformPlatformConfig(unwrap(r.data)));

export const getPresence = (): Promise<DriverPresence> =>
  apiClient.get<Api>('/drivers/presence').then((r) => transformPresence(unwrap(r.data)));

export const goOnline = (input: GoOnlineInput): Promise<DriverPresence> =>
  apiClient
    .post<Api>('/drivers/online', { lat: input.lat, lng: input.lng, vehicle_id: input.vehicleId ?? null })
    .then((r) => transformPresence(unwrap(r.data)));

export const goOffline = (): Promise<DriverPresence> =>
  apiClient.post<Api>('/drivers/offline').then((r) => transformPresence(unwrap(r.data)));

export const sendHeartbeat = (lat: number, lng: number): Promise<DriverPresence> =>
  apiClient.post<Api>('/drivers/heartbeat', { lat, lng }).then((r) => transformPresence(unwrap(r.data)));
