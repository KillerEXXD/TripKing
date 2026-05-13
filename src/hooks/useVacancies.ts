import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import { cancelVacancy, getVacancies, getVacancy, postVacancy } from '@/lib/api/services/vacancies';
import type { PostVacancyInput, VacanciesQueryParams } from '@/types';

export function useVacancies(params?: VacanciesQueryParams) {
  return useQuery({ queryKey: ['vacancies', params ?? {}], queryFn: () => getVacancies(params), staleTime: STALE.live });
}
export function useVacancy(id: string | undefined) {
  return useQuery({ queryKey: ['vacancy', id], queryFn: () => getVacancy(id as string), enabled: !!id, staleTime: STALE.live });
}

/**
 * The signed-in driver's currently-active vacancies. Drives the "I'm available"
 * card's X/2 counter + the matching backend limit (POST /vacancies rejects a 3rd
 * with 409 CONFLICT — see supabase/functions/vacancies/index.ts).
 * Disabled until we know the caller's driverId.
 */
export function useMyActiveVacancies(driverId: string | undefined) {
  const params: VacanciesQueryParams = { driverId, status: 'active' };
  return useQuery({
    queryKey: ['vacancies', driverId ? params : { driverId: 'pending' }],
    queryFn: () => getVacancies(params),
    enabled: !!driverId,
    staleTime: STALE.live,
  });
}

function useInvalidateVacancies() {
  const qc = useQueryClient();
  return (id?: string) => {
    void qc.invalidateQueries({ queryKey: ['vacancies'] });
    if (id) void qc.invalidateQueries({ queryKey: ['vacancy', id] });
  };
}
export function usePostVacancy() {
  const invalidate = useInvalidateVacancies();
  return useMutation({ mutationFn: (input: PostVacancyInput) => postVacancy(input), onSuccess: () => invalidate() });
}
export function useCancelVacancy() {
  const invalidate = useInvalidateVacancies();
  return useMutation({ mutationFn: (id: string) => cancelVacancy(id), onSuccess: (_d, id) => invalidate(id) });
}
