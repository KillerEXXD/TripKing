import { useQuery } from '@tanstack/react-query';
import { listTrips, getTrip, listApplicantsForTrip } from '@/lib/api/services/trips';
import type { TripStatus } from '@/types';

export function useTrips(filter?: { status?: TripStatus[] }) {
  return useQuery({
    queryKey: ['trips', filter],
    queryFn: () => listTrips(filter),
    staleTime: 30_000,
  });
}

export function useTrip(tripId: string | undefined) {
  return useQuery({
    queryKey: ['trip', tripId],
    queryFn: () => (tripId ? getTrip(tripId) : null),
    enabled: !!tripId,
    staleTime: 30_000,
  });
}

export function useTripApplicants(tripId: string | undefined) {
  return useQuery({
    queryKey: ['trip', tripId, 'applicants'],
    queryFn: () => (tripId ? listApplicantsForTrip(tripId) : []),
    enabled: !!tripId,
    staleTime: 15_000,
  });
}
