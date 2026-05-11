import { useQuery } from '@tanstack/react-query';
import { listActiveVacancies } from '@/lib/api/services/vacancies';

export function useActiveVacancies() {
  return useQuery({
    queryKey: ['vacancies', 'active'],
    queryFn: () => listActiveVacancies(),
    staleTime: 30_000,
  });
}
