import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE } from '@/lib/queryClient';
import {
  bookVideoCall,
  cancelVideoCall,
  finalizeVideoCall,
  getAvailableVideoSlots,
  getScheduledVideoCalls,
  getVideoVerification,
  markVideoCallNoShow,
  rescheduleVideoCall,
  setVideoCallStatus,
  type SetVideoCallStatusInput,
} from '@/lib/api/services/videoVerifications';
import type { FinalizeVideoCallInput, ScheduledVideoCallsQueryParams } from '@/types';

/** Free 15-min video-call slots (next ~14 days). */
export function useAvailableVideoSlots(enabled = true) {
  return useQuery({ queryKey: ['video-verifications', 'slots'], queryFn: getAvailableVideoSlots, enabled, staleTime: STALE.live });
}
export function useVideoVerification(id: string | undefined) {
  return useQuery({ queryKey: ['video-verification', id], queryFn: () => getVideoVerification(id as string), enabled: !!id, staleTime: STALE.live });
}

function useInvalidateSubjectAfterVideo() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['video-verifications'] });
    void qc.invalidateQueries({ queryKey: ['driver', 'me'] });
    void qc.invalidateQueries({ queryKey: ['agent', 'me'] });
  };
}

/** Book a video-call slot — subject's kyc_status → video_pending. Pass `kind` when the caller has both driver + manager profiles (admins via the role switcher). */
export function useBookVideoCall() {
  const invalidate = useInvalidateSubjectAfterVideo();
  return useMutation({ mutationFn: ({ slotAt, kind }: { slotAt: string; kind?: 'driver' | 'manager' }) => bookVideoCall(slotAt, kind), onSuccess: invalidate });
}
export function useCancelVideoCall() {
  const invalidate = useInvalidateSubjectAfterVideo();
  return useMutation({ mutationFn: (id: string) => cancelVideoCall(id), onSuccess: invalidate });
}
export function useRescheduleVideoCall() {
  const invalidate = useInvalidateSubjectAfterVideo();
  return useMutation({ mutationFn: ({ id, slotAt }: { id: string; slotAt: string }) => rescheduleVideoCall(id, slotAt), onSuccess: invalidate });
}

// ── admin (Video Call Console) ───────────────────────────────────────────────
export function useScheduledVideoCalls(params?: ScheduledVideoCallsQueryParams) {
  return useQuery({ queryKey: ['video-verifications', 'admin', params ?? {}], queryFn: () => getScheduledVideoCalls(params), staleTime: STALE.live });
}
export function useFinalizeVideoCall() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: FinalizeVideoCallInput }) => finalizeVideoCall(id, input),
    onSuccess: (vv) => {
      void qc.invalidateQueries({ queryKey: ['video-verifications'] });
      void qc.invalidateQueries({ queryKey: ['video-verification', vv.id] });
      if (vv.driverId) {
        void qc.invalidateQueries({ queryKey: ['driver', vv.driverId] });
        void qc.invalidateQueries({ queryKey: ['drivers'] });
      }
      if (vv.managerId) {
        void qc.invalidateQueries({ queryKey: ['agent', vv.managerId] });
        void qc.invalidateQueries({ queryKey: ['agents'] });
      }
    },
  });
}
/** Admin manual status override — mirrors `useFinalizeVideoCall` invalidations. */
export function useSetVideoCallStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SetVideoCallStatusInput }) => setVideoCallStatus(id, input),
    onSuccess: (vv) => {
      void qc.invalidateQueries({ queryKey: ['video-verifications'] });
      void qc.invalidateQueries({ queryKey: ['video-verification', vv.id] });
      if (vv.driverId) {
        void qc.invalidateQueries({ queryKey: ['driver', vv.driverId] });
        void qc.invalidateQueries({ queryKey: ['drivers'] });
      }
      if (vv.managerId) {
        void qc.invalidateQueries({ queryKey: ['agent', vv.managerId] });
        void qc.invalidateQueries({ queryKey: ['agents'] });
      }
    },
  });
}
export function useMarkVideoCallNoShow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markVideoCallNoShow(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['video-verifications'] }),
  });
}
