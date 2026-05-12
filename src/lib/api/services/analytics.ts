/** Analytics service — the server-computed dashboard / per-agent / API-metrics blobs (`/analytics/*`). */
import { apiClient, EmptyResponseError } from '@/lib/api/client';
import { transformAdminDashboard, transformAgentAnalytics, transformApiMetricsSummary } from '@/lib/api/transforms/analytics';
import type { AdminDashboard, AgentAnalytics, ApiMetricsSummary } from '@/types';

type Api = Record<string, unknown>;
function unwrap<T>(d: T | null): T {
  if (d === null || d === undefined) throw new EmptyResponseError('analytics');
  return d;
}

/** Platform-wide dashboard (`GET /analytics/admin`; admin only — 403 otherwise). */
export function getAdminDashboard(): Promise<AdminDashboard> {
  return apiClient.get<Api>('/analytics/admin').then((r) => transformAdminDashboard(unwrap(r.data)));
}

/** One agent's analytics (`GET /analytics/agent`; the caller's own, or `userId` for admins — 403 otherwise). */
export function getAgentAnalytics(userId?: string): Promise<AgentAnalytics> {
  return apiClient.get<Api>('/analytics/agent', userId ? { user_id: userId } : undefined).then((r) => transformAgentAnalytics(unwrap(r.data)));
}

/** Per-endpoint latency/error rollup over the last `hours` (`GET /analytics/api-metrics`; admin only). Default 24h, capped at 720. */
export function getApiMetricsSummary(hours?: number): Promise<ApiMetricsSummary> {
  return apiClient.get<Api>('/analytics/api-metrics', hours ? { hours } : undefined).then((r) => transformApiMetricsSummary(unwrap(r.data)));
}
