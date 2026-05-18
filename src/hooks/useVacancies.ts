import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import { createInvalidator } from '@/lib/hooks/createInvalidator';
import { cancelVacancy, getVacancies, getVacancy, patchVacancy, postVacancy } from '@/lib/api/services/vacancies';
import type { PostVacancyInput, VacanciesQueryParams } from '@/types';

export function useVacancies(params?: VacanciesQueryParams) {
  return useQuery({ queryKey: ['vacancies', params ?? {}], queryFn: () => getVacancies(params), placeholderData: keepPreviousData, staleTime: STALE.live });
}
export function useVacancy(id: string | undefined) {
  return useQuery({ queryKey: ['vacancy', id], queryFn: () => getVacancy(id as string), enabled: !!id, staleTime: STALE.live });
}

/**
 * The signed-in driver's currently-active vacancies — includes both freshly-posted
 * 'active' rows AND 'on_trip' rows (a vacancy auto-suspended because the driver
 * accepted a trip whose pickup_at lands inside its window — migration 039). Both
 * count against the X/2 limit (the slot is still occupied), and the 'on_trip' row
 * renders a banner on its card explaining why it's hidden from agents.
 * Disabled until we know the caller's driverId.
 */
export function useMyActiveVacancies(driverId: string | undefined) {
  const params: VacanciesQueryParams = { driverId, status: ['active', 'on_trip'] };
  return useQuery({
    // No 'pending' sentinel: `enabled: !!driverId` already gates the fetch, so a queryKey
    // tied to a non-existent driverId would never resolve. The old sentinel created phantom
    // cache rows that lingered across sessions. The key is stable on (driverId, 'active').
    queryKey: ['vacancies', driverId, 'active'],
    queryFn: () => getVacancies(params),
    enabled: !!driverId,
    staleTime: STALE.live,
  });
}

/** The driver's recently-expired vacancies (last 7 days). Shown in /my-trips?tab=available
 *  with a red "Expired" badge so the driver knows to delete or repost. Kept separate from
 *  `useMyActiveVacancies` so the X/2 quota counter on `IAmAvailableCard` isn't inflated. */
export function useMyExpiredVacancies(driverId: string | undefined) {
  const params: VacanciesQueryParams = { driverId, status: ['expired'] };
  return useQuery({
    queryKey: ['vacancies', driverId, 'expired'],
    queryFn: () => getVacancies(params),
    enabled: !!driverId,
    staleTime: STALE.live,
  });
}

const useInvalidateVacancies = createInvalidator('vacancies', 'vacancy');
export function usePostVacancy() {
  const invalidate = useInvalidateVacancies();
  return useMutation({ mutationFn: (input: PostVacancyInput) => postVacancy(input), onSuccess: () => invalidate() });
}
export function useUpdateVacancy() {
  const invalidate = useInvalidateVacancies();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<PostVacancyInput> }) => patchVacancy(id, input),
    onSuccess: (_d, vars) => invalidate(vars.id),
  });
}
export function useCancelVacancy() {
  const invalidate = useInvalidateVacancies();
  return useMutation({ mutationFn: (id: string) => cancelVacancy(id), onSuccess: (_d, id) => invalidate(id) });
}
