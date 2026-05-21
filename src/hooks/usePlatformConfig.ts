import { useQuery } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import { getPlatformConfig } from '@/lib/api/services/presence';
import type { DispatchAlgorithm } from '@/types';

/**
 * Public platform config (GET /config) — drives which availability UI a driver
 * sees ("I'm Online" vs "I'm vacant"). Cached on the `master` tier; the public
 * endpoint also carries a short HTTP cache so an admin algorithm flip propagates
 * within ~30s.
 */
export function usePlatformConfig() {
  return useQuery({ queryKey: ['platform-config'], queryFn: getPlatformConfig, staleTime: STALE.master });
}

/**
 * The active platform dispatch algorithm. Fails safe to 'manual' (today's
 * behaviour) while loading or on error — so a config blip never strands drivers
 * in the new Auto UI.
 */
export function useDispatchAlgorithm(): DispatchAlgorithm {
  return usePlatformConfig().data?.dispatchAlgorithm ?? 'manual';
}
