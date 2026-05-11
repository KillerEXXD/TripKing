import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Trip } from '@/types';

/**
 * Trips the current user has posted via the Post Trip form.
 *
 * In production this is the manager's row in the `trips` table. For the
 * prototype we shadow the seed mock data with a localStorage list so that:
 *  - The poster's PostedTrips view shows their own posts immediately.
 *  - The trip-detail link from the share card resolves to a real trip
 *    object on the same device (other devices fall through to the URL-hash
 *    decoder in tripShare.decodeTripFromHash).
 *
 * Service-layer accessor: callers go through the trips service which
 * merges this store with mockTrips. Direct getState() is acceptable in
 * service modules per the same pattern as tripStateStore.
 */

interface UserPostedTripsStore {
  trips: Trip[];
  addTrip: (trip: Trip) => void;
  reset: () => void;
}

export const useUserPostedTripsStore = create<UserPostedTripsStore>()(
  persist(
    (set, get) => ({
      trips: [],
      addTrip: (trip) => set({ trips: [trip, ...get().trips] }),
      reset: () => set({ trips: [] }),
    }),
    {
      name: 'drivermahal:user-posted-trips',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);
