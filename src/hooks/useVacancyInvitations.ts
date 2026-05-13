import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import {
  createVacancyInvitation, decideVacancyInvitation, getVacancyInvitation, getVacancyInvitations,
} from '@/lib/api/services/vacancyInvitations';
import type { CreateVacancyInvitationInput, VacancyInvitationsQueryParams } from '@/types';

export function useVacancyInvitations(params: VacancyInvitationsQueryParams = {}) {
  return useQuery({
    queryKey: ['vacancy-invitations', params],
    queryFn: () => getVacancyInvitations(params),
    staleTime: STALE.live,
  });
}
export function useVacancyInvitation(id: string | undefined) {
  return useQuery({
    queryKey: ['vacancy-invitation', id],
    queryFn: () => getVacancyInvitation(id as string),
    enabled: !!id,
    staleTime: STALE.live,
  });
}

function useInvalidateVacancyInvitations() {
  const qc = useQueryClient();
  return (id?: string) => {
    void qc.invalidateQueries({ queryKey: ['vacancy-invitations'] });
    if (id) void qc.invalidateQueries({ queryKey: ['vacancy-invitation', id] });
    // an accept inserts a trip_acceptances row + flips the trip to has_applicants — refresh related views
    void qc.invalidateQueries({ queryKey: ['notifications'] });
    void qc.invalidateQueries({ queryKey: ['vacancies'] });
    void qc.invalidateQueries({ queryKey: ['trips'] });
  };
}

export function useCreateVacancyInvitation() {
  const invalidate = useInvalidateVacancyInvitations();
  return useMutation({
    mutationFn: (input: CreateVacancyInvitationInput) => createVacancyInvitation(input),
    onSuccess: (d) => invalidate(d.id),
  });
}

export function useDecideVacancyInvitation() {
  const invalidate = useInvalidateVacancyInvitations();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'accepted' | 'declined' }) => decideVacancyInvitation(id, status),
    onSuccess: (_d, v) => invalidate(v.id),
  });
}
