/** Alerts service — saved searches. (The `/alerts/*` edge functions land later.) */
import { apiClient, EmptyResponseError } from '@/lib/api/client';
import { toApiAlert, transformAlert } from '@/lib/api/transforms/alert';
import type { Alert, AlertInput } from '@/types';

type Api = Record<string, unknown>;
function unwrap<T>(d: T | null): T {
  if (d === null || d === undefined) throw new EmptyResponseError('alerts');
  return d;
}

export function getMyAlerts(): Promise<Alert[]> {
  return apiClient.get<Api[]>('/alerts').then((r) => (r.data ?? []).map(transformAlert));
}
export function getAlert(id: string): Promise<Alert> {
  return apiClient.get<Api>(`/alerts/${id}`).then((r) => transformAlert(unwrap(r.data)));
}
export function createAlert(input: AlertInput): Promise<Alert> {
  return apiClient.post<Api>('/alerts', toApiAlert(input)).then((r) => transformAlert(unwrap(r.data)));
}
export function updateAlert(id: string, patch: Partial<AlertInput>): Promise<Alert> {
  return apiClient.patch<Api>(`/alerts/${id}`, toApiAlert(patch)).then((r) => transformAlert(unwrap(r.data)));
}
export function setAlertActive(id: string, isActive: boolean): Promise<Alert> {
  return apiClient.patch<Api>(`/alerts/${id}`, { is_active: isActive, paused_at: isActive ? null : new Date().toISOString() }).then((r) => transformAlert(unwrap(r.data)));
}
export function deleteAlert(id: string): Promise<void> {
  return apiClient.delete<unknown>(`/alerts/${id}`).then(() => undefined);
}
