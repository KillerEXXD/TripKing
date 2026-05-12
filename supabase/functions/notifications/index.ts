/**
 * /notifications/* — the in-app inbox (caller's own rows only). Bearer-authed; withTiming;
 * verify_jwt = false (we validate via GoTrue, then read/write with the service-role client
 * scoped to the caller — mirrors the RLS "owner read / owner mark-read" policy).
 *
 *   GET    /notifications              ?unread_only=true&limit=
 *   PATCH  /notifications/:id           { is_read: true } — own only
 *   POST   /notifications/read-all      — mark all own notifications read
 */
// @ts-expect-error — Deno std, resolved at runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsPreflight, ok, fail } from '../_shared/cors.ts';
import { withTiming } from '../_shared/timing.ts';
import { serviceClient } from '../_shared/supabase.ts';

function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') ?? req.headers.get('Authorization');
  return h && h.startsWith('Bearer ') ? h.slice(7) : null;
}

const handler = withTiming('notifications', async (req: Request): Promise<Response> => {
  const pre = corsPreflight(req);
  if (pre) return pre;
  const db = serviceClient();

  const token = bearer(req);
  if (!token) return fail('UNAUTHORIZED', 'Bearer token required', 401);
  const { data: authData, error: authErr } = await db.auth.getUser(token);
  if (authErr || !authData?.user) return fail('UNAUTHORIZED', 'Invalid or expired token', 401);
  const uid = authData.user.id;

  const url = new URL(req.url);
  const m = url.pathname.match(/\/notifications(?:\/(.+))?$/);
  const segs = (m && m[1] ? m[1] : '').split('/').filter(Boolean);
  const seg0 = segs[0];

  // GET /notifications
  if (!seg0 && req.method === 'GET') {
    let q = db.from('notifications').select('*').eq('user_id', uid).order('created_at', { ascending: false });
    if (url.searchParams.get('unread_only') === 'true') q = q.eq('is_read', false);
    const limit = Number(url.searchParams.get('limit') ?? '50');
    q = q.limit(Math.min(Number.isFinite(limit) ? limit : 50, 100));
    const { data, error } = await q;
    if (error) return fail('DB_ERROR', error.message, 500);
    return ok(data ?? []);
  }

  // POST /notifications/read-all
  if (seg0 === 'read-all' && req.method === 'POST') {
    const { error } = await db.from('notifications').update({ is_read: true }).eq('user_id', uid).eq('is_read', false);
    if (error) return fail('DB_ERROR', error.message, 400);
    return ok({ ok: true });
  }

  // PATCH /notifications/:id  — mark read (own only)
  if (seg0 && seg0 !== 'read-all' && (req.method === 'PATCH' || req.method === 'PUT')) {
    let isRead = true;
    try {
      const body = await req.json();
      if (body && typeof body === 'object' && (body as Record<string, unknown>).is_read === false) isRead = false;
    } catch {
      /* default to true */
    }
    const { data, error } = await db
      .from('notifications')
      .update({ is_read: isRead })
      .eq('id', seg0)
      .eq('user_id', uid)
      .select('*')
      .maybeSingle();
    if (error) return error.code === '22P02' ? fail('VALIDATION', 'invalid id', 422) : fail('DB_ERROR', error.message, 400);
    if (!data) return fail('NOT_FOUND', 'Notification not found', 404);
    return ok(data);
  }

  return fail('NOT_FOUND', 'No such notifications route', 404);
});

serve(handler);
