/** Bug-tracker transforms — strict, throw on missing required fields. */
import { ApiTransformError } from '@/lib/api/transforms/base';
import {
  BUG_CATEGORIES,
  BUG_PRIORITIES,
  BUG_STATUSES,
  type BugAttachment,
  type BugCategory,
  type BugComment,
  type BugPriority,
  type BugReport,
  type BugStatus,
  type PatchBugReportInput,
  type PostBugReportInput,
} from '@/types';

export type BugReportTransformErrorCode =
  | 'MISSING_ID'
  | 'MISSING_NUMBER'
  | 'MISSING_TITLE'
  | 'BAD_STATUS'
  | 'BAD_PRIORITY'
  | 'BAD_CATEGORY'
  | 'BAD_ATTACHMENT'
  | 'BAD_COMMENT';

export class BugReportTransformError extends ApiTransformError<BugReportTransformErrorCode> {}

type Api = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
const strDef = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export function transformBugAttachment(api: Api): BugAttachment {
  const id = str(api.id);
  if (!id) throw new BugReportTransformError('attachment has no id', 'BAD_ATTACHMENT', { api });
  const bugId = str(api.bug_id);
  if (!bugId) throw new BugReportTransformError('attachment has no bug_id', 'BAD_ATTACHMENT', { id });
  return {
    id,
    bugId,
    storagePath: strDef(api.storage_path),
    fileName: strDef(api.file_name),
    fileSize: num(api.file_size),
    contentType: strDef(api.content_type),
    uploadedBy: str(api.uploaded_by),
    signedUrl: str(api.signed_url),
    createdAt: strDef(api.created_at, new Date().toISOString()),
  };
}

export function transformBugComment(api: Api): BugComment {
  const id = str(api.id);
  if (!id) throw new BugReportTransformError('comment has no id', 'BAD_COMMENT', { api });
  const bugId = str(api.bug_id);
  if (!bugId) throw new BugReportTransformError('comment has no bug_id', 'BAD_COMMENT', { id });
  const content = strDef(api.content);
  if (!content) throw new BugReportTransformError('comment has no content', 'BAD_COMMENT', { id });
  return {
    id,
    bugId,
    userId: str(api.user_id),
    userName: strDef(api.user_name),
    userRole: strDef(api.user_role),
    content,
    createdAt: strDef(api.created_at, new Date().toISOString()),
  };
}

export function transformBugReport(api: Api): BugReport {
  const id = str(api.id);
  if (!id) throw new BugReportTransformError('bug report has no id', 'MISSING_ID', { api });
  const bugNumber = str(api.bug_number);
  if (!bugNumber) throw new BugReportTransformError('bug report has no bug_number', 'MISSING_NUMBER', { id });
  const title = str(api.title);
  if (!title) throw new BugReportTransformError('bug report has no title', 'MISSING_TITLE', { id });
  const status = strDef(api.status);
  if (!(BUG_STATUSES as readonly string[]).includes(status)) {
    throw new BugReportTransformError(`bad bug status "${status}"`, 'BAD_STATUS', { id });
  }
  const priority = strDef(api.priority);
  if (!(BUG_PRIORITIES as readonly string[]).includes(priority)) {
    throw new BugReportTransformError(`bad bug priority "${priority}"`, 'BAD_PRIORITY', { id });
  }
  const category = strDef(api.category);
  if (!(BUG_CATEGORIES as readonly string[]).includes(category)) {
    throw new BugReportTransformError(`bad bug category "${category}"`, 'BAD_CATEGORY', { id });
  }

  const comments = Array.isArray(api.comments) ? (api.comments as Api[]).map(transformBugComment) : undefined;
  const attachments = Array.isArray(api.attachments) ? (api.attachments as Api[]).map(transformBugAttachment) : undefined;

  return {
    id,
    bugNumber,
    title,
    description: strDef(api.description),
    stepsToReproduce: strDef(api.steps_to_reproduce),
    expected: strDef(api.expected),
    actual: strDef(api.actual),
    priority: priority as BugPriority,
    category: category as BugCategory,
    status: status as BugStatus,

    reporterId: str(api.reporter_id),
    reporterRole: strDef(api.reporter_role),
    reporterPhone: strDef(api.reporter_phone),
    reporterName: strDef(api.reporter_name),

    pageUrl: strDef(api.page_url),
    route: strDef(api.route),
    browserInfo: obj(api.browser_info),
    appVersion: strDef(api.app_version),
    consoleLogs: strDef(api.console_logs),
    breadcrumbs: arr(api.breadcrumbs),
    context: obj(api.context),
    queryCacheSnapshot: arr(api.query_cache_snapshot),

    sentryReplayUrl: str(api.sentry_replay_url),
    posthogSessionUrl: str(api.posthog_session_url),
    posthogSessionId: str(api.posthog_session_id),

    assignedTo: str(api.assigned_to),
    resolutionNotes: strDef(api.resolution_notes),
    resolvedAt: str(api.resolved_at),
    resolvedBy: str(api.resolved_by),

    comments,
    attachments,

    createdAt: strDef(api.created_at, new Date().toISOString()),
    updatedAt: strDef(api.updated_at, new Date().toISOString()),
  };
}

/** camelCase → snake_case for POST /bug-reports. Omits undefined values. */
export function toApiBugReportInput(input: PostBugReportInput): Record<string, unknown> {
  const out: Record<string, unknown> = { title: input.title };
  if (input.description !== undefined) out.description = input.description;
  if (input.stepsToReproduce !== undefined) out.steps_to_reproduce = input.stepsToReproduce;
  if (input.expected !== undefined) out.expected = input.expected;
  if (input.actual !== undefined) out.actual = input.actual;
  if (input.priority !== undefined) out.priority = input.priority;
  if (input.category !== undefined) out.category = input.category;
  if (input.pageUrl !== undefined) out.page_url = input.pageUrl;
  if (input.route !== undefined) out.route = input.route;
  if (input.browserInfo !== undefined) out.browser_info = input.browserInfo;
  if (input.appVersion !== undefined) out.app_version = input.appVersion;
  if (input.consoleLogs !== undefined) out.console_logs = input.consoleLogs;
  if (input.breadcrumbs !== undefined) out.breadcrumbs = input.breadcrumbs;
  if (input.context !== undefined) out.context = input.context;
  if (input.queryCacheSnapshot !== undefined) out.query_cache_snapshot = input.queryCacheSnapshot;
  if (input.sentryReplayUrl !== undefined) out.sentry_replay_url = input.sentryReplayUrl;
  if (input.posthogSessionUrl !== undefined) out.posthog_session_url = input.posthogSessionUrl;
  if (input.posthogSessionId !== undefined) out.posthog_session_id = input.posthogSessionId;
  return out;
}

/** camelCase → snake_case for PATCH /bug-reports/:id. */
export function toApiBugReportPatch(input: PatchBugReportInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.status !== undefined) out.status = input.status;
  if (input.priority !== undefined) out.priority = input.priority;
  if (input.category !== undefined) out.category = input.category;
  if (input.assignedTo !== undefined) out.assigned_to = input.assignedTo;
  if (input.resolutionNotes !== undefined) out.resolution_notes = input.resolutionNotes;
  return out;
}
