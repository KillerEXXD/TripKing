import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '@/lib/api/client';
import * as svc from '@/lib/api/services/bugReports';

function ok<T>(data: T) {
  return Promise.resolve({ success: true, data, error: null });
}

beforeEach(() => vi.restoreAllMocks());

describe('bugReports service', () => {
  it('getBugReports passes snake_case filters', async () => {
    const get = vi.spyOn(apiClient, 'get').mockReturnValue(ok([]) as never);
    await svc.getBugReports({ status: 'open', q: 'foo', page: 2, limit: 25 });
    expect(get).toHaveBeenCalledWith('/bug-reports', { status: 'open', q: 'foo', page: 2, limit: 25 });
  });

  it('postBugReport runs the input through the camel→snake mapper', async () => {
    const row = { id: 'b1', bug_number: 'BUG-001', title: 'T', status: 'open', priority: 'medium', category: 'ui' };
    const post = vi.spyOn(apiClient, 'post').mockReturnValue(ok(row) as never);
    const r = await svc.postBugReport({ title: 'T', stepsToReproduce: 'S' });
    expect(post).toHaveBeenCalledWith('/bug-reports', { title: 'T', steps_to_reproduce: 'S' });
    expect(r.bugNumber).toBe('BUG-001');
  });

  it('patchBugReport hits PATCH /:id with snake_case', async () => {
    const row = { id: 'b1', bug_number: 'BUG-001', title: 'T', status: 'resolved', priority: 'medium', category: 'ui' };
    const patch = vi.spyOn(apiClient, 'patch').mockReturnValue(ok(row) as never);
    await svc.patchBugReport('b1', { status: 'resolved', resolutionNotes: 'n' });
    expect(patch).toHaveBeenCalledWith('/bug-reports/b1', { status: 'resolved', resolution_notes: 'n' });
  });

  it('postBugComment posts the content to /:id/comments', async () => {
    const post = vi.spyOn(apiClient, 'post').mockReturnValue(ok({ id: 'c1', bug_id: 'b1', content: 'hi' }) as never);
    const r = await svc.postBugComment('b1', { content: 'hi' });
    expect(post).toHaveBeenCalledWith('/bug-reports/b1/comments', { content: 'hi' });
    expect(r.content).toBe('hi');
  });

  it('getBugAttachmentUploadUrl returns the signed envelope', async () => {
    vi.spyOn(apiClient, 'post').mockReturnValue(
      ok({
        bucket: 'bug-attachments', path: 'b1/x.png', signed_url: 'https://signed', token: 'tok',
        attachment: { id: 'a1', bug_id: 'b1', storage_path: 'b1/x.png', file_name: 'x.png', file_size: 1, content_type: 'image/png' },
      }) as never,
    );
    const r = await svc.getBugAttachmentUploadUrl('b1', { fileName: 'x.png', fileSize: 1, contentType: 'image/png' });
    expect(r.signedUrl).toBe('https://signed');
    expect(r.attachment.id).toBe('a1');
  });

  it('uploadBugAttachmentBytes PUTs the file and throws on non-2xx', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('', { status: 200 }))
                            .mockResolvedValueOnce(new Response('nope', { status: 500, statusText: 'boom' }));
    vi.stubGlobal('fetch', fetchMock);
    await svc.uploadBugAttachmentBytes('https://x', new File(['x'], 'x.png', { type: 'image/png' }));
    await expect(svc.uploadBugAttachmentBytes('https://x', new File(['x'], 'x.png', { type: 'image/png' }))).rejects.toThrow(/upload failed/);
    vi.unstubAllGlobals();
  });

  it('setCanReportBugs PATCHes /admin/users/:id', async () => {
    const patch = vi.spyOn(apiClient, 'patch').mockReturnValue(ok({}) as never);
    await svc.setCanReportBugs('u1', true);
    expect(patch).toHaveBeenCalledWith('/admin/users/u1', { can_report_bugs: true });
  });
});
