/**
 * /alerts/* — saved searches that fire a notification on a matching trip/vacancy. Owner-scoped:
 * every route requires a Bearer token; the caller only sees/edits their own alerts (admin may
 * read any). withTiming; verify_jwt = false (the function validates) — mirrors the migration-003
 * RLS "alerts owner read / owner insert/update/delete (+ admin read)" policy.
 *
 *   GET    /alerts        (Bearer) — the caller's alerts (joins from/to city)
 *   GET    /alerts/:id    (owner/admin; Bearer)
 *   POST   /alerts        (Bearer) — user_id = caller; from_city_id required
 *   PATCH  /alerts/:id    (owner; Bearer) — partial; include is_active/paused_at to pause/resume
 *   DELETE /alerts/:id    (owner; Bearer)
 */
// @ts-expect-error — Deno std, resolved at runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsPreflight, ok, fail } from '../_shared/cors.ts';
import { withTiming } from '../_shared/timing.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { rateLimitOk } from '../_shared/rateLimit.ts';

type Db = ReturnType<typeof serviceClient>;
const ALERT_SELECT = '*, from_city:cities!from_city_id(*), to_city:cities!to_city_id(*)';
const WRITABLE = [
  'name', 'from_city_id', 'from_radius_km', 'to_city_id', 'to_radius_km',
  'min_rate_per_km', 'min_commission_pct', 'car_type_ids',
  'pickup_window_start', 'pickup_window_end', 'notify_via', 'is_active', 'paused_at',
];

function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') ?? req.headers.get('Authorization');
  return h && h.startsWith('Bearer ') ? h.slice(7) : null;
}
async function authUser(db: Db, req: Request): Promise<{ id: string; role: string } | null> {
  const token = bearer(req);
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: u } = await db.from('users').select('id, role').eq('id', data.user.id).maybeSingle();
  return u ? { id: u.id as string, role: u.role as string } : { id: data.user.id, role: 'driver' };
}
const isAdmin = (u: { role: string } | null) => u?.role === 'admin';
async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
function pgFail(error: { code?: string; message: string }): Response {
  if (error.code === '23505') return fail('CONFLICT', error.message, 409);
  if (error.code === '23503') return fail('VALIDATION', error.message, 422);
  if (error.code === '23502' || error.code === '23514' || error.code === '22P02') return fail('VALIDATION', error.message, 422);
  return fail('DB_ERROR', error.message, 400);
}
function pick(src: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (src[k] !== undefined) out[k] = src[k];
  return out;
}

const handler = withTiming('alerts', async (req: Request): Promise<Response> => {
  const pre = corsPreflight(req);
  if (pre) return pre;
  const db = serviceClient();
  const url = new URL(req.url);
  const m = url.pathname.match(/\/alerts(?:\/(.+))?$/);
  const id = (m && m[1] ? m[1] : '').split('/').filter(Boolean)[0];

  async function fullAlert(alertId: string): Promise<Response> {
    const { data, error } = await db.from('alerts').select(ALERT_SELECT).eq('id', alertId).maybeSingle();
    if (error) return fail('DB_ERROR', error.message, 500);
    if (!data) return fail('NOT_FOUND', 'Alert not found', 404);
    return ok(data);
  }

  // every route requires auth
  const u = await authUser(db, req);
  if (!u) return fail('UNAUTHORIZED', 'Sign in to manage alerts', 401);

  // ── GET /alerts (the caller's) ───────────────────────────────────────────
  if (!id && req.method === 'GET') {
    const { data, error } = await db.from('alerts').select(ALERT_SELECT).eq('user_id', u.id).order('created_at', { ascending: false }).limit(200);
    if (error) return fail('DB_ERROR', error.message, 500);
    return ok(data ?? []);
  }

  // ── POST /alerts ─────────────────────────────────────────────────────────
  if (!id && req.method === 'POST') {
    if (!(await rateLimitOk(db, `post-alert:${u.id}`, 30, 60))) return fail('RATE_LIMITED', 'Too many alerts created — try again shortly', 429);
    const b = await readBody(req);
    const insert = { ...pick(b, WRITABLE), user_id: u.id };
    if (!insert.from_city_id || typeof insert.from_city_id !== 'string') return fail('VALIDATION', 'from_city_id is required', 422);
    const { data: created, error } = await db.from('alerts').insert(insert).select('id').single();
    if (error) return pgFail(error);
    return fullAlert(created.id as string);
  }

  if (!id) return fail('NOT_FOUND', 'No such route', 404);

  const { data: alert } = await db.from('alerts').select('id, user_id').eq('id', id).maybeSingle();
  if (!alert) return fail('NOT_FOUND', 'Alert not found', 404);
  const owner = (alert.user_id as string) === u.id;

  // ── GET /alerts/:id (owner/admin) ────────────────────────────────────────
  if (req.method === 'GET') {
    if (!owner && !isAdmin(u)) return fail('FORBIDDEN', 'Not your alert', 403);
    return fullAlert(id);
  }

  // ── PATCH /alerts/:id (owner) ────────────────────────────────────────────
  if (req.method === 'PATCH' || req.method === 'PUT') {
    if (!owner) return fail('FORBIDDEN', 'Not your alert', 403);
    const b = await readBody(req);
    const patch = pick(b, WRITABLE);
    if (Object.keys(patch).length === 0) return fail('VALIDATION', 'Nothing to update', 422);
    const { error } = await db.from('alerts').update(patch).eq('id', id);
    if (error) return pgFail(error);
    return fullAlert(id);
  }

  // ── DELETE /alerts/:id (owner) ───────────────────────────────────────────
  if (req.method === 'DELETE') {
    if (!owner) return fail('FORBIDDEN', 'Not your alert', 403);
    const { error } = await db.from('alerts').delete().eq('id', id);
    if (error) return pgFail(error);
    return ok({ deleted: id });
  }

  return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed`, 405);
});

serve(handler);
