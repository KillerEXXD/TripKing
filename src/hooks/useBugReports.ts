/**
 * useBugReports — React Query bindings over `src/lib/api/services/bugReports`.
 * Live data: `staleTime: 30_000` per CLAUDE.md §"Caching".
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  getBugAttachmentUploadUrl,
  getBugComments,
  getBugReport,
  getBugReports,
  patchBugReport,
  postBugComment,
  postBugReport,
  setCanReportBugs,
  uploadBugAttachmentBytes,
} from '@/lib/api/services/bugReports';
import type {
  BugReportFilters,
  PatchBugReportInput,
  PostBugCommentInput,
  PostBugReportInput,
} from '@/types';

const STALE = 30_000;

export function useBugReports(filters?: BugReportFilters) {
  return useQuery({
    queryKey: ['bug-reports', filters ?? {}],
    queryFn: () => getBugReports(filters),
    staleTime: STALE,
  });
}

export function useBugReport(id: string | undefined) {
  return useQuery({
    queryKey: ['bug-report', id],
    queryFn: () => getBugReport(id as string),
    enabled: !!id,
    staleTime: STALE,
  });
}

export function useBugComments(id: string | undefined) {
  return useQuery({
    queryKey: ['bug-report', id, 'comments'],
    queryFn: () => getBugComments(id as string),
    enabled: !!id,
    staleTime: STALE,
  });
}

export function usePostBugReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PostBugReportInput) => postBugReport(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bug-reports'] });
    },
  });
}

export function usePatchBugReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string } & PatchBugReportInput) => patchBugReport(id, patch),
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['bug-reports'] });
      void qc.invalidateQueries({ queryKey: ['bug-report', v.id] });
    },
  });
}

export function usePostBugComment(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PostBugCommentInput) => postBugComment(id as string, input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bug-report', id, 'comments'] });
      void qc.invalidateQueries({ queryKey: ['bug-report', id] });
    },
  });
}

/** Request a signed upload URL and PUT the bytes. */
export function useUploadBugAttachment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ bugId, file }: { bugId: string; file: File }) => {
      const signed = await getBugAttachmentUploadUrl(bugId, {
        fileName: file.name,
        fileSize: file.size,
        contentType: file.type,
      });
      await uploadBugAttachmentBytes(signed.signedUrl, file);
      return signed;
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['bug-report', v.bugId] });
    },
  });
}

/** Admin per-user toggle for `users.can_report_bugs`. Optimistically refreshes driver/agent caches. */
export function useSetCanReportBugs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, value }: { userId: string; value: boolean }) => setCanReportBugs(userId, value),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['drivers'] });
      void qc.invalidateQueries({ queryKey: ['agents'] });
      void qc.invalidateQueries({ queryKey: ['user'] });
    },
  });
}
