import type { KycStatus } from '@/types';

export const KYC_LABEL: Record<KycStatus, string> = {
  pending: 'Pending',
  docs_submitted: 'Docs submitted',
  video_pending: 'Video pending',
  ready_for_approval: 'Ready for approval',
  approved: 'Approved',
  rejected: 'Rejected',
  resubmit_required: 'Resubmit required',
};

export const KYC_VARIANT: Record<KycStatus, 'success' | 'warning' | 'info' | 'muted' | 'destructive'> = {
  pending: 'muted',
  docs_submitted: 'info',
  video_pending: 'info',
  ready_for_approval: 'success',
  approved: 'success',
  rejected: 'destructive',
  resubmit_required: 'warning',
};

export const NEEDS_REVIEW: KycStatus[] = ['pending', 'docs_submitted', 'video_pending', 'ready_for_approval', 'resubmit_required'];
