import { useQuery } from '@tanstack/react-query';
import { getDriver, listDrivers } from '@/lib/api/services/drivers';

export function useDriver(driverId: string | undefined) {
  return useQuery({
    queryKey: ['driver', driverId],
    queryFn: () => (driverId ? getDriver(driverId) : null),
    enabled: !!driverId,
    staleTime: 60_000,
  });
}

export function useDrivers() {
  return useQuery({
    queryKey: ['drivers'],
    queryFn: () => listDrivers(),
    staleTime: 60_000,
  });
}
