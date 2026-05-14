/**
 * Bug-tracker domain types. Wire format is snake_case (see openapi.yaml
 * `/bug-reports`); `src/lib/api/transforms/bugReport.ts` is the strict
 * one-way bridge.
 */
import type { ListQueryParams } from './api';

export type BugStatus =
  | 'open'
  | 'in_progress'
  | 'needs_info'
  | 'resolved'
  | 'verified'
  | 'reopened'
  | 'closed';

export type BugPriority = 'low' | 'medium' | 'high' | 'critical';

export type BugCategory =
  | 'auth_otp'
  | 'trip_post'
  | 'trip_apply'
  | 'kyc_docs'
  | 'video_call'
  | 'vehicle_eligibility'
  | 'map_location'
  | 'notification'
  | 'ui'
  | 'other';

export const BUG_STATUSES: readonly BugStatus[] = [
  'open',
  'in_progress',
  'needs_info',
  'resolved',
  'verified',
  'reopened',
  'closed',
] as const;

export const BUG_PRIORITIES: readonly BugPriority[] = ['low', 'medium', 'high', 'critical'] as const;

export const BUG_CATEGORIES: readonly BugCategory[] = [
  'auth_otp',
  'trip_post',
  'trip_apply',
  'kyc_docs',
  'video_call',
  'vehicle_eligibility',
  'map_location',
  'notification',
  'ui',
  'other',
] as const;

/** A row from `public.bug_attachments`, optionally with a 5-min signed download URL when fetched via GET detail. */
export interface BugAttachment {
  id: string;
  bugId: string;
  storagePath: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  uploadedBy?: string;
  /** 5-min signed download URL (only present on GET /bug-reports/:id detail). */
  signedUrl?: string;
  createdAt: string;
}

/** A row from `public.bug_comments`. */
export interface BugComment {
  id: string;
  bugId: string;
  userId?: string;
  userName: string;
  userRole: string;
  content: string;
  createdAt: string;
}

/** A row from `public.bug_reports` (joined with comments + attachments on GET :id). */
export interface BugReport {
  id: string;
  /** `BUG-NNN` from the server-side sequence. */
  bugNumber: string;
  title: string;
  description: string;
  stepsToReproduce: string;
  expected: string;
  actual: string;
  priority: BugPriority;
  category: BugCategory;
  status: BugStatus;

  reporterId?: string;
  reporterRole: string;
  reporterPhone: string;
  reporterName: string;

  pageUrl: string;
  route: string;
  browserInfo: Record<string, unknown>;
  appVersion: string;
  consoleLogs: string;
  breadcrumbs: unknown[];
  context: Record<string, unknown>;
  queryCacheSnapshot: unknown[];

  sentryReplayUrl?: string;
  posthogSessionUrl?: string;
  posthogSessionId?: string;

  assignedTo?: string;
  resolutionNotes: string;
  resolvedAt?: string;
  resolvedBy?: string;

  /** Only on GET /:id. */
  comments?: BugComment[];
  attachments?: BugAttachment[];

  createdAt: string;
  updatedAt: string;
}

/** POST /bug-reports body (client side; `toApiBugReportInput` converts to snake_case). */
export interface PostBugReportInput {
  title: string;
  description?: string;
  stepsToReproduce?: string;
  expected?: string;
  actual?: string;
  priority?: BugPriority;
  category?: BugCategory;
  pageUrl?: string;
  route?: string;
  browserInfo?: Record<string, unknown>;
  appVersion?: string;
  consoleLogs?: string;
  breadcrumbs?: unknown[];
  context?: Record<string, unknown>;
  queryCacheSnapshot?: unknown[];
  sentryReplayUrl?: string;
  posthogSessionUrl?: string;
  posthogSessionId?: string;
}

/** PATCH /bug-reports/:id body. */
export interface PatchBugReportInput {
  status?: BugStatus;
  priority?: BugPriority;
  category?: BugCategory;
  assignedTo?: string | null;
  resolutionNotes?: string;
}

/** GET /bug-reports list filters. */
export interface BugReportFilters extends ListQueryParams {
  status?: BugStatus;
  priority?: BugPriority;
  category?: BugCategory;
  reporterId?: string;
  q?: string;
}

/** Response shape of POST /bug-reports/:id/attachment-upload-url. */
export interface BugAttachmentUploadUrl {
  bucket: string;
  path: string;
  signedUrl: string;
  token: string;
  attachment: BugAttachment;
}

export interface PostBugCommentInput {
  content: string;
}
