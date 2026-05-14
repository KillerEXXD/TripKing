/**
 * /bug-reports/* — bug tracker. Gated by users.can_report_bugs (admins always allowed).
 *
 *   POST   /bug-reports                          (Bearer) — submit a bug; gate-checked; fan-out notify all admins
 *   GET    /bug-reports                          (admin)  — list with filters & pagination
 *   GET    /bug-reports/:id                      (admin or reporter) — joined detail (comments + attachments w/ signed urls)
 *   PATCH  /bug-reports/:id                      (admin)  — status/assigned_to/resolution_notes; notify reporter on resolved
 *   POST   /bug-reports/:id/attachment-upload-url (reporter or admin) — short-lived signed UPLOAD url
 *   POST   /bug-reports/:id/comments             (admin or reporter) — add a comment; mirror notify the other party
 *   GET    /bug-reports/:id/comments             (admin or reporter)
 */
// @ts-expect-error — Deno std, resolved at runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsPreflight, ok, fail } from '../_shared/cors.ts';
import { withTiming } from '../_shared/timing.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { bearer } from '../_shared/auth.ts';
import { readBody, pgFail } from '../_shared/http.ts';

type Db = ReturnType<typeof serviceClient>;
type Row = Record<string, unknown>;

const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
const CATEGORIES = [
  'auth_otp', 'trip_post', 'trip_apply', 'kyc_docs', 'video_call',
  'vehicle_eligibility', 'map_location', 'notification', 'ui', 'other',
] as const;
const STATUSES = ['open', 'in_progress', 'needs_info', 'resolved', 'verified', 'reopened', 'closed'] as const;

interface AuthUser { id: string; role: string; phone: string; display_name: string; can_report_bugs: boolean }
async function authUser(db: Db, req: Request): Promise<AuthUser | null> {
  const token = bearer(req);
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: u } = await db.from('users')
    .select('id, role, phone, display_name, can_report_bugs')
    .eq('id', data.user.id).maybeSingle();
  if (!u) return null;
  return {
    id: u.id as string,
    role: (u.role as string) ?? 'driver',
    phone: (u.phone as string) ?? '',
    display_name: (u.display_name as string) ?? '',
    can_report_bugs: u.can_report_bugs === true,
  };
}
const isAdmin = (u: AuthUser | null): boolean => u?.role === 'admin';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

const handler = withTiming('bug-reports', async (req: Request): Promise<Response> => {
  const pre = corsPreflight(req);
  if (pre) return pre;
  const db = serviceClient();
  const url = new URL(req.url);
  const m = url.pathname.match(/\/bug-reports(?:\/(.+))?$/);
  const segs = (m && m[1] ? m[1] : '').split('/').filter(Boolean);
  const id = segs[0];
  const sub = segs[1]; // 'comments' | 'attachment-upload-url'

  // ── POST /bug-reports (gate-checked submit) ──────────────────────────────
  if (!id && req.method === 'POST') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', 'Sign in to report a bug', 401);
    if (!isAdmin(u) && !u.can_report_bugs) return fail('BUG_REPORTS_NOT_ENABLED', 'Bug reporting is not enabled for your account', 403);
    const b = await readBody(req);
    const title = str(b.title).trim();
    if (!title) return fail('VALIDATION', 'title is required', 422);
    const priority = str(b.priority) || 'medium';
    if (!(PRIORITIES as readonly string[]).includes(priority)) return fail('VALIDATION', `priority must be one of ${PRIORITIES.join(', ')}`, 422);
    const category = str(b.category) || 'other';
    if (!(CATEGORIES as readonly string[]).includes(category)) return fail('VALIDATION', `category must be one of ${CATEGORIES.join(', ')}`, 422);

    const insert: Row = {
      title,
      description: str(b.description),
      steps_to_reproduce: str(b.steps_to_reproduce),
      expected: str(b.expected),
      actual: str(b.actual),
      priority,
      category,
      reporter_id: u.id,
      reporter_role: u.role,
      reporter_phone: u.phone,
      reporter_name: u.display_name,
      page_url: str(b.page_url),
      route: str(b.route),
      browser_info: obj(b.browser_info),
      app_version: str(b.app_version),
      console_logs: str(b.console_logs),
      breadcrumbs: arr(b.breadcrumbs),
      context: obj(b.context),
      query_cache_snapshot: arr(b.query_cache_snapshot),
      sentry_replay_url: strOrNull(b.sentry_replay_url),
      posthog_session_url: strOrNull(b.posthog_session_url),
      posthog_session_id: strOrNull(b.posthog_session_id),
    };
    const { data: created, error } = await db.from('bug_reports').insert(insert).select('*').single();
    if (error) return pgFail(error);

    // fan-out: notify every admin
    const { data: admins } = await db.from('users').select('id').eq('role', 'admin').eq('is_active', true);
    const adminRows = (admins ?? []) as { id: string }[];
    if (adminRows.length > 0) {
      const bugNumber = (created.bug_number as string) ?? '';
      const note = adminRows.map((a) => ({
        user_id: a.id,
        type: 'bug_reported',
        title: `New bug: ${bugNumber}`,
        body: `${u.display_name || 'A user'} reported "${title}" (${priority}).`,
        payload_json: { bug_id: created.id, bug_number: bugNumber, priority, category },
      }));
      await db.from('notifications').insert(note);
    }
    return ok(created);
  }

  if (!id && req.method === 'GET') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', 'Sign in', 401);
    if (!isAdmin(u)) return fail('FORBIDDEN', 'Admin only', 403);
    const limit = Math.min(Math.max(1, Number(url.searchParams.get('limit') ?? '50') || 50), 200);
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let q = db.from('bug_reports').select('*', { count: 'exact' });
    const status = url.searchParams.get('status');
    if (status) q = q.eq('status', status);
    const priority = url.searchParams.get('priority');
    if (priority) q = q.eq('priority', priority);
    const category = url.searchParams.get('category');
    if (category) q = q.eq('category', category);
    const reporterId = url.searchParams.get('reporter_id');
    if (reporterId) q = q.eq('reporter_id', reporterId);
    const qStr = url.searchParams.get('q');
    if (qStr) q = q.ilike('title', `%${qStr}%`);
    q = q.order('created_at', { ascending: false }).range(from, to);

    const { data, error, count } = await q;
    if (error) return fail('DB_ERROR', error.message, 500);
    const total = typeof count === 'number' ? count : (data ?? []).length;
    return ok(data ?? [], { total, page, limit, has_more: from + (data ?? []).length < total });
  }

  if (!id) return fail('NOT_FOUND', 'No such route', 404);

  // load the bug for ownership / 404
  const { data: bug } = await db.from('bug_reports').select('*').eq('id', id).maybeSingle();
  if (!bug) return fail('NOT_FOUND', 'Bug report not found', 404);
  const reporterId = (bug.reporter_id as string) ?? '';

  // ── GET /bug-reports/:id (admin or reporter) ─────────────────────────────
  if (!sub && req.method === 'GET') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', '', 401);
    if (!isAdmin(u) && u.id !== reporterId) return fail('FORBIDDEN', 'Not your bug report', 403);
    const { data: comments } = await db.from('bug_comments').select('*').eq('bug_id', id).order('created_at', { ascending: true });
    const { data: atts } = await db.from('bug_attachments').select('*').eq('bug_id', id).order('created_at', { ascending: true });
    const attachments = await Promise.all(((atts ?? []) as Row[]).map(async (a) => {
      const p = a.storage_path as string;
      const { data: signed } = await db.storage.from('bug-attachments').createSignedUrl(p, 300);
      return { ...a, signed_url: signed?.signedUrl ?? null };
    }));
    return ok({ ...bug, comments: comments ?? [], attachments });
  }

  // ── PATCH /bug-reports/:id (admin) ───────────────────────────────────────
  if (!sub && (req.method === 'PATCH' || req.method === 'PUT')) {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', '', 401);
    if (!isAdmin(u)) return fail('FORBIDDEN', 'Admin only', 403);
    const b = await readBody(req);
    const patch: Row = {};
    if (typeof b.status === 'string') {
      if (!(STATUSES as readonly string[]).includes(b.status)) return fail('VALIDATION', `status must be one of ${STATUSES.join(', ')}`, 422);
      patch.status = b.status;
    }
    if (typeof b.assigned_to === 'string' || b.assigned_to === null) patch.assigned_to = b.assigned_to;
    if (typeof b.resolution_notes === 'string') patch.resolution_notes = b.resolution_notes;
    if (typeof b.priority === 'string') {
      if (!(PRIORITIES as readonly string[]).includes(b.priority)) return fail('VALIDATION', `priority must be one of ${PRIORITIES.join(', ')}`, 422);
      patch.priority = b.priority;
    }
    if (typeof b.category === 'string') {
      if (!(CATEGORIES as readonly string[]).includes(b.category)) return fail('VALIDATION', `category must be one of ${CATEGORIES.join(', ')}`, 422);
      patch.category = b.category;
    }
    if (Object.keys(patch).length === 0) return fail('VALIDATION', 'nothing to update', 422);
    const wasResolved = (bug.status as string) === 'resolved' || (bug.status as string) === 'closed' || (bug.status as string) === 'verified';
    if (patch.status === 'resolved' && !wasResolved) {
      patch.resolved_at = new Date().toISOString();
      patch.resolved_by = u.id;
    }
    const { data: updated, error } = await db.from('bug_reports').update(patch).eq('id', id).select('*').single();
    if (error) return pgFail(error);
    if (patch.status === 'resolved' && !wasResolved && reporterId) {
      await db.from('notifications').insert({
        user_id: reporterId,
        type: 'bug_resolved',
        title: `Bug resolved: ${bug.bug_number}`,
        body: `Your bug "${bug.title}" has been marked resolved.`,
        payload_json: { bug_id: id, bug_number: bug.bug_number },
      });
    }
    return ok(updated);
  }

  // ── POST /bug-reports/:id/attachment-upload-url (reporter or admin) ──────
  if (sub === 'attachment-upload-url' && req.method === 'POST') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', '', 401);
    if (!isAdmin(u) && u.id !== reporterId) return fail('FORBIDDEN', 'Not your bug report', 403);
    const b = await readBody(req);
    const fileName = str(b.file_name).replace(/[^\w.\-]+/g, '_') || `attachment-${Date.now()}`;
    const fileSize = typeof b.file_size === 'number' ? b.file_size : 0;
    const contentType = str(b.content_type);
    const path = `${id}/${Date.now()}-${fileName}`;
    const { data: signed, error } = await db.storage.from('bug-attachments').createSignedUploadUrl(path);
    if (error || !signed) return fail('STORAGE_ERROR', error?.message ?? 'could not create upload url', 500);
    // also record the attachment row up-front so the GET joins reflect it after the client PUTs
    const { data: attRow, error: attErr } = await db.from('bug_attachments').insert({
      bug_id: id,
      storage_path: path,
      file_name: fileName,
      file_size: fileSize,
      content_type: contentType,
      uploaded_by: u.id,
    }).select('*').single();
    if (attErr) return pgFail(attErr);
    return ok({
      bucket: 'bug-attachments',
      path,
      signed_url: signed.signedUrl,
      token: signed.token,
      attachment: attRow,
    });
  }

  // ── /bug-reports/:id/comments ────────────────────────────────────────────
  if (sub === 'comments') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', '', 401);
    if (!isAdmin(u) && u.id !== reporterId) return fail('FORBIDDEN', 'Not your bug report', 403);
    if (req.method === 'GET') {
      const { data, error } = await db.from('bug_comments').select('*').eq('bug_id', id).order('created_at', { ascending: true });
      if (error) return fail('DB_ERROR', error.message, 500);
      return ok(data ?? []);
    }
    if (req.method === 'POST') {
      const b = await readBody(req);
      const content = str(b.content).trim();
      if (!content) return fail('VALIDATION', 'content is required', 422);
      const { data: created, error } = await db.from('bug_comments').insert({
        bug_id: id,
        user_id: u.id,
        user_name: u.display_name,
        user_role: u.role,
        content,
      }).select('*').single();
      if (error) return pgFail(error);
      // mirror notification to the *other* party
      const notifyUserId = isAdmin(u) ? reporterId : null;
      if (notifyUserId) {
        await db.from('notifications').insert({
          user_id: notifyUserId,
          type: 'bug_commented',
          title: `Comment on ${bug.bug_number}`,
          body: `${u.display_name || 'Admin'} commented on your bug "${bug.title}".`,
          payload_json: { bug_id: id, bug_number: bug.bug_number },
        });
      } else if (reporterId && !isAdmin(u)) {
        // reporter commented — notify all admins
        const { data: admins } = await db.from('users').select('id').eq('role', 'admin').eq('is_active', true);
        const adminRows = (admins ?? []) as { id: string }[];
        if (adminRows.length > 0) {
          await db.from('notifications').insert(adminRows.map((a) => ({
            user_id: a.id,
            type: 'bug_commented',
            title: `Comment on ${bug.bug_number}`,
            body: `${u.display_name || 'A reporter'} commented on "${bug.title}".`,
            payload_json: { bug_id: id, bug_number: bug.bug_number },
          })));
        }
      }
      return ok(created);
    }
    return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed`, 405);
  }

  return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed`, 405);
});

serve(handler);
