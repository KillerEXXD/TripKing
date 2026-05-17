import { useParams } from 'react-router-dom';
import { useTrip } from '@/hooks/useTrips';

/**
 * Tiny shared helper for the v2 trip-detail pages — pulls the route
 * param + delegates to `useTrip`. Lives at /vN/trips/:id across all
 * skins so SkinSwitcher's path-aware swap stays trivial.
 */
export function useTripDetail() {
  const { id } = useParams<{ id: string }>();
  const query = useTrip(id);
  return { id, ...query };
}
