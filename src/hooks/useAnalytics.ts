import { useQuery } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import { getAdminDashboard, getAgentAnalytics, getApiMetricsSummary } from '@/lib/api/services/analytics';

/** The platform dashboard (admin only — the query 403s otherwise). */
export function useAdminDashboard() {
  return useQuery({ queryKey: ['analytics', 'admin'], queryFn: getAdminDashboard, staleTime: STALE.profile });
}
/** A trip manager's analytics — the caller's own when `userId` is omitted; pass `userId` (admin only) for a specific agent. */
export function useAgentAnalytics(userId?: string) {
  return useQuery({ queryKey: ['analytics', 'agent', userId ?? 'me'], queryFn: () => getAgentAnalytics(userId), staleTime: STALE.profile });
}
/** Per-endpoint API-metrics rollup over the last `hours` (admin only). */
export function useApiMetricsSummary(hours?: number) {
  return useQuery({ queryKey: ['analytics', 'api-metrics', hours ?? 24], queryFn: () => getApiMetricsSummary(hours), staleTime: STALE.profile });
}
