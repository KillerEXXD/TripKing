import { useQueryClient } from '@tanstack/react-query';

/**
 * Factory for the `useInvalidate<Domain>` helper that every data-domain hook file
 * (useTrips, useDrivers, useAlerts, …) used to redefine inline.
 *
 * Returns a React hook that returns a `(id?) => void` closure. Calling it invalidates
 * the list query (`[listKey]`); if an id is passed, it also invalidates the per-item
 * query (`[itemKey, id]`).
 *
 * Usage:
 *   const useInvalidateTrips = createInvalidator('trips', 'trip');
 *   // …
 *   const invalidate = useInvalidateTrips();
 *   invalidate();             // refresh the list
 *   invalidate(tripId);       // refresh the list AND the per-trip query
 */
export function createInvalidator(listKey: string, itemKey: string): () => (id?: string) => void {
  return function useInvalidator() {
    const qc = useQueryClient();
    return (id?: string) => {
      void qc.invalidateQueries({ queryKey: [listKey] });
      if (id) void qc.invalidateQueries({ queryKey: [itemKey, id] });
    };
  };
}
