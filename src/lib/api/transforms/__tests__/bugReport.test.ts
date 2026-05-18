import { describe, it, expect } from 'vitest';
import {
  BugReportTransformError,
  toApiBugReportInput,
  toApiBugReportPatch,
  transformBugAttachment,
  transformBugComment,
  transformBugReport,
} from '@/lib/api/transforms/bugReport';

function fullPayload() {
  return {
    id: 'b1',
    bug_number: 'BUG-001',
    title: 'Boom',
    description: 'd',
    steps_to_reproduce: 's',
    expected: 'e',
    actual: 'a',
    priority: 'high',
    category: 'ui',
    status: 'open',
    reporter_id: 'u9',
    reporter_role: 'driver',
    reporter_phone: '+91',
    reporter_name: 'Ravi',
    page_url: 'https://x',
    route: '/app/trips',
    browser_info: { ua: 'jsdom' },
    app_version: '0.1.0',
    console_logs: 'log',
    breadcrumbs: [{ a: 1 }],
    context: { foo: 'bar' },
    query_cache_snapshot: [{ k: ['trips'] }],
    sentry_replay_url: 'sr',
    posthog_session_url: 'ps',
    posthog_session_id: 'sid',
    assigned_to: 'u2',
    resolution_notes: 'n',
    resolved_at: '2026-01-01T00:00:00Z',
    resolved_by: 'u2',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('transformBugReport', () => {
  it('maps a complete snake_case row to a strict camelCase BugReport', () => {
    const b = transformBugReport(fullPayload());
    expect(b.id).toBe('b1');
    expect(b.bugNumber).toBe('BUG-001');
    expect(b.priority).toBe('high');
    expect(b.category).toBe('ui');
    expect(b.status).toBe('open');
    expect(b.browserInfo).toEqual({ ua: 'jsdom' });
    expect(b.queryCacheSnapshot).toEqual([{ k: ['trips'] }]);
    expect(b.comments).toBeUndefined();
    expect(b.attachments).toBeUndefined();
  });

  it('maps joined comments + attachments on detail responses', () => {
    const b = transformBugReport({
      ...fullPayload(),
      comments: [{ id: 'c1', bug_id: 'b1', content: 'hi', user_name: 'A', user_role: 'admin' }],
      attachments: [{ id: 'a1', bug_id: 'b1', storage_path: 'b1/x.png', signed_url: 'https://x' }],
    });
    expect(b.comments?.[0].content).toBe('hi');
    expect(b.attachments?.[0].signedUrl).toBe('https://x');
  });

  it('throws BugReportTransformError on missing id / number / title', () => {
    expect(() => transformBugReport({ ...fullPayload(), id: undefined })).toThrow(BugReportTransformError);
    expect(() => transformBugReport({ ...fullPayload(), bug_number: undefined })).toThrow(/no bug_number/);
    expect(() => transformBugReport({ ...fullPayload(), title: undefined })).toThrow(/no title/);
  });

  it('throws on unknown status / priority / category', () => {
    expect(() => transformBugReport({ ...fullPayload(), status: 'wat' })).toThrow(/bad bug status/);
    expect(() => transformBugReport({ ...fullPayload(), priority: 'urgent' })).toThrow(/bad bug priority/);
    expect(() => transformBugReport({ ...fullPayload(), category: 'magic' })).toThrow(/bad bug category/);
  });
});

describe('transformBugComment / transformBugAttachment', () => {
  it('strict on comment/attachment ids', () => {
    expect(() => transformBugComment({ bug_id: 'b1', content: 'hi' })).toThrow(BugReportTransformError);
    expect(() => transformBugComment({ id: 'c1', content: 'hi' })).toThrow(/no bug_id/);
    expect(() => transformBugComment({ id: 'c1', bug_id: 'b1' })).toThrow(/no content/);
    expect(() => transformBugAttachment({})).toThrow(BugReportTransformError);
    expect(() => transformBugAttachment({ id: 'a1' })).toThrow(/no bug_id/);
  });

  it('happy paths produce well-formed objects', () => {
    expect(transformBugComment({ id: 'c1', bug_id: 'b1', content: 'hi', user_name: 'A', user_role: 'admin' })).toMatchObject({ id: 'c1', bugId: 'b1', content: 'hi' });
    expect(transformBugAttachment({ id: 'a1', bug_id: 'b1', file_name: 'x.png', file_size: 99 })).toMatchObject({ id: 'a1', bugId: 'b1', fileName: 'x.png', fileSize: 99 });
  });
});

describe('toApiBugReportInput / toApiBugReportPatch', () => {
  it('omits undefined keys + maps to snake_case', () => {
    const body = toApiBugReportInput({
      title: 'T',
      stepsToReproduce: 'S',
      browserInfo: { x: 1 },
      queryCacheSnapshot: [{ k: 1 }],
      posthogSessionId: 'sid',
    });
    expect(body).toEqual({ title: 'T', steps_to_reproduce: 'S', browser_info: { x: 1 }, query_cache_snapshot: [{ k: 1 }], posthog_session_id: 'sid' });
  });

  it('patch omits keys until set; assignedTo passes through null', () => {
    expect(toApiBugReportPatch({})).toEqual({});
    expect(toApiBugReportPatch({ status: 'resolved', assignedTo: null })).toEqual({ status: 'resolved', assigned_to: null });
    expect(toApiBugReportPatch({ resolutionNotes: 'n' })).toEqual({ resolution_notes: 'n' });
  });
});
