/** Bug reports service — wraps `/bug-reports/*` (see openapi.yaml). */
import { apiClient, EmptyResponseError } from '@/lib/api/client';
import {
  toApiBugReportInput,
  toApiBugReportPatch,
  transformBugComment,
  transformBugReport,
} from '@/lib/api/transforms/bugReport';
import type {
  BugAttachmentUploadUrl,
  BugComment,
  BugReport,
  BugReportFilters,
  PatchBugReportInput,
  PostBugCommentInput,
  PostBugReportInput,
} from '@/types';

type Api = Record<string, unknown>;
function unwrap<T>(d: T | null | undefined): T {
  if (d === null || d === undefined) throw new EmptyResponseError('bug-reports');
  return d;
}

export function getBugReports(params?: BugReportFilters): Promise<BugReport[]> {
  const q: Record<string, unknown> = {};
  if (params?.status) q.status = params.status;
  if (params?.priority) q.priority = params.priority;
  if (params?.category) q.category = params.category;
  if (params?.reporterId) q.reporter_id = params.reporterId;
  if (params?.q) q.q = params.q;
  if (params?.page) q.page = params.page;
  if (params?.limit) q.limit = params.limit;
  return apiClient.get<Api[]>('/bug-reports', Object.keys(q).length ? q : undefined).then((r) => (r.data ?? []).map(transformBugReport));
}

export function getBugReport(id: string): Promise<BugReport> {
  return apiClient.get<Api>(`/bug-reports/${id}`).then((r) => transformBugReport(unwrap(r.data)));
}

export function postBugReport(input: PostBugReportInput): Promise<BugReport> {
  return apiClient.post<Api>('/bug-reports', toApiBugReportInput(input)).then((r) => transformBugReport(unwrap(r.data)));
}

export function patchBugReport(id: string, patch: PatchBugReportInput): Promise<BugReport> {
  return apiClient.patch<Api>(`/bug-reports/${id}`, toApiBugReportPatch(patch)).then((r) => transformBugReport(unwrap(r.data)));
}

export function getBugComments(id: string): Promise<BugComment[]> {
  return apiClient.get<Api[]>(`/bug-reports/${id}/comments`).then((r) => (r.data ?? []).map(transformBugComment));
}

export function postBugComment(id: string, input: PostBugCommentInput): Promise<BugComment> {
  return apiClient.post<Api>(`/bug-reports/${id}/comments`, { content: input.content }).then((r) => transformBugComment(unwrap(r.data)));
}

/** Request a short-lived signed UPLOAD URL — the server pre-records the attachment row. */
export function getBugAttachmentUploadUrl(
  id: string,
  meta: { fileName: string; fileSize: number; contentType: string },
): Promise<BugAttachmentUploadUrl> {
  return apiClient
    .post<Api>(`/bug-reports/${id}/attachment-upload-url`, {
      file_name: meta.fileName,
      file_size: meta.fileSize,
      content_type: meta.contentType,
    })
    .then((r) => {
      const d = unwrap(r.data);
      const attachment = d.attachment as Api | undefined;
      return {
        bucket: typeof d.bucket === 'string' ? d.bucket : 'bug-attachments',
        path: typeof d.path === 'string' ? d.path : '',
        signedUrl: typeof d.signed_url === 'string' ? d.signed_url : '',
        token: typeof d.token === 'string' ? d.token : '',
        attachment: attachment
          ? {
              id: typeof attachment.id === 'string' ? attachment.id : '',
              bugId: typeof attachment.bug_id === 'string' ? attachment.bug_id : id,
              storagePath: typeof attachment.storage_path === 'string' ? attachment.storage_path : '',
              fileName: typeof attachment.file_name === 'string' ? attachment.file_name : '',
              fileSize: typeof attachment.file_size === 'number' ? attachment.file_size : 0,
              contentType: typeof attachment.content_type === 'string' ? attachment.content_type : '',
              uploadedBy: typeof attachment.uploaded_by === 'string' ? attachment.uploaded_by : undefined,
              createdAt: typeof attachment.created_at === 'string' ? attachment.created_at : new Date().toISOString(),
            }
          : {
              id: '',
              bugId: id,
              storagePath: '',
              fileName: meta.fileName,
              fileSize: meta.fileSize,
              contentType: meta.contentType,
              createdAt: new Date().toISOString(),
            },
      };
    });
}

/** Direct PUT of the file bytes to the signed URL returned by `getBugAttachmentUploadUrl`. */
export async function uploadBugAttachmentBytes(signedUrl: string, file: File): Promise<void> {
  const res = await fetch(signedUrl, {
    method: 'PUT',
    headers: file.type ? { 'content-type': file.type } : undefined,
    body: file,
  });
  if (!res.ok) {
    throw new Error(`upload failed: ${res.status} ${res.statusText}`);
  }
}

/** Admin per-user toggle — flips `users.can_report_bugs`. */
export function setCanReportBugs(userId: string, value: boolean): Promise<void> {
  return apiClient.patch<unknown>(`/admin/users/${userId}`, { can_report_bugs: value }).then(() => undefined);
}
