import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import { createPassengerReview, createReview, getReviews, moderateReview, reportReview } from '@/lib/api/services/reviews';
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
/** Admin moderation queue — flagged reviews. */
export function useFlaggedReviews() {
  return useQuery({ queryKey: ['reviews', 'flagged'], queryFn: () => getReviews({ flagged: true }), staleTime: STALE.live });
}

export function useCreateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ReviewInput) => createReview(input),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['reviews'] });
      if (v.rateeUserId) void qc.invalidateQueries({ queryKey: ['driver', v.rateeUserId] });
    },
  });
}

/** Passenger portal — anonymous review submission (OTP-gated). */
export function useCreatePassengerReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { tripId: string; passengerOtp: string; score: number; comment?: string; tagIds?: string[] }) => createPassengerReview(input),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['reviews', { tripId: v.tripId }] });
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
/** Admin moderation action (clear the flag, or hide the review). */
export function useModerateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...opts }: { id: string; isPublished?: boolean; clearFlag?: boolean }) => moderateReview(id, opts),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['reviews'] }),
  });
}
