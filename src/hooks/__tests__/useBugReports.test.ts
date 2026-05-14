import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';

vi.mock('@/lib/api/services/bugReports');
import * as svc from '@/lib/api/services/bugReports';
import {
  useBugComments,
  useBugReport,
  useBugReports,
  usePatchBugReport,
  usePostBugComment,
  usePostBugReport,
  useSetCanReportBugs,
  useUploadBugAttachment,
} from '@/hooks/useBugReports';

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
  return { qc, invalidate, wrapper };
}

beforeEach(() => vi.restoreAllMocks());

describe('useBugReports hooks', () => {
  it('useBugReports fetches via getBugReports', async () => {
    vi.mocked(svc.getBugReports).mockResolvedValue([{ id: 'b1', bugNumber: 'BUG-001' }] as never);
    const { wrapper } = setup();
    const { result } = renderHook(() => useBugReports({ status: 'open' }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(svc.getBugReports).toHaveBeenCalledWith({ status: 'open' });
  });

  it('useBugReport + useBugComments are disabled without an id', () => {
    const { wrapper } = setup();
    const r = renderHook(() => useBugReport(undefined), { wrapper });
    const c = renderHook(() => useBugComments(undefined), { wrapper });
    expect(svc.getBugReport).not.toHaveBeenCalled();
    expect(svc.getBugComments).not.toHaveBeenCalled();
    expect(r.result.current.fetchStatus).toBe('idle');
    expect(c.result.current.fetchStatus).toBe('idle');
  });

  it('usePostBugReport invalidates the list', async () => {
    vi.mocked(svc.postBugReport).mockResolvedValue({ id: 'b1' } as never);
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => usePostBugReport(), { wrapper });
    await act(async () => { await result.current.mutateAsync({ title: 'T' }); });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['bug-reports'] });
  });

  it('usePatchBugReport invalidates list + detail', async () => {
    vi.mocked(svc.patchBugReport).mockResolvedValue({ id: 'b1' } as never);
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => usePatchBugReport(), { wrapper });
    await act(async () => { await result.current.mutateAsync({ id: 'b1', status: 'resolved' }); });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['bug-reports'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['bug-report', 'b1'] });
  });

  it('usePostBugComment invalidates the comment thread + detail', async () => {
    vi.mocked(svc.postBugComment).mockResolvedValue({ id: 'c1', content: 'hi' } as never);
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => usePostBugComment('b1'), { wrapper });
    await act(async () => { await result.current.mutateAsync({ content: 'hi' }); });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['bug-report', 'b1', 'comments'] });
  });

  it('useUploadBugAttachment runs sign-then-PUT', async () => {
    vi.mocked(svc.getBugAttachmentUploadUrl).mockResolvedValue({ signedUrl: 'https://s', path: 'b1/x', bucket: 'bug-attachments', token: 't', attachment: { id: 'a' } } as never);
    vi.mocked(svc.uploadBugAttachmentBytes).mockResolvedValue(undefined as never);
    const { wrapper } = setup();
    const { result } = renderHook(() => useUploadBugAttachment(), { wrapper });
    await act(async () => { await result.current.mutateAsync({ bugId: 'b1', file: new File(['x'], 'x.png') }); });
    expect(svc.getBugAttachmentUploadUrl).toHaveBeenCalled();
    expect(svc.uploadBugAttachmentBytes).toHaveBeenCalled();
  });

  it('useSetCanReportBugs invalidates driver + agent caches', async () => {
    vi.mocked(svc.setCanReportBugs).mockResolvedValue(undefined as never);
    const { invalidate, wrapper } = setup();
    const { result } = renderHook(() => useSetCanReportBugs(), { wrapper });
    await act(async () => { await result.current.mutateAsync({ userId: 'u1', value: true }); });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['drivers'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['agents'] });
  });
});
