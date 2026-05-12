import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import { createReview, getReviews, reportReview } from '@/lib/api/services/reviews';
import type { ReviewInput, ReviewsQueryParams } from '@/types';

export function useReviews(params?: ReviewsQueryParams) {
  return useQuery({ queryKey: ['reviews', params ?? {}], queryFn: () => getReviews(params), staleTime: STALE.profile });
}
export function useDriverReviews(rateeUserId: string | undefined, params?: Omit<ReviewsQueryParams, 'rateeUserId'>) {
  return useQuery({
    queryKey: ['reviews', 'ratee', rateeUserId, params ?? {}],
    queryFn: () => getReviews({ ...params, rateeUserId }),
    enabled: !!rateeUserId,
    staleTime: STALE.profile,
  });
}

export function useCreateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReviewInput) => createReview(input),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['reviews'] });
      if (v.rateeUserId) void qc.invalidateQueries({ queryKey: ['driver'] });
    },
  });
}
export function useReportReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => reportReview(id, reason),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['reviews'] }),
  });
}
