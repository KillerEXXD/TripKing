/**
 * /agents/* — agent (trip-manager) marketplace profiles. The twin of /drivers/*
 * (supabase/functions/drivers/index.ts); `agents` ≙ the `trip_managers` table. Public reads;
 * owner/admin writes (Bearer-validated); withTiming; verify_jwt = false (mirrors the RLS
 * "trip_managers read / owner-or-admin write" policy in migration 002).
 *
 *   GET   /agents              ?business_city_id=&kyc_status=&limit=     (public; kyc_status accepts a CSV — the admin KYC queue)
 *   GET   /agents/me           (Bearer) — the caller's own agent profile (joined; 404 if none)
 *   POST  /agents              (Bearer) — create my agent profile; user_id = caller; users.role → trip_manager; idempotent
 *   GET   /agents/:id          (public) — joins business city
 *   PATCH /agents/:id          (owner/admin; Bearer) — full_name, email, business_name, business_city_id, profile_photo_url
 *   PATCH /agents/:id/kyc      (admin; Bearer) — { kyc_status, note? } — moves the KYC workflow + fires a kyc_status_change notification
 */
// @ts-expect-error — Deno std, resolved at runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsPreflight, ok, fail } from '../_shared/cors.ts';
import { withTiming } from '../_shared/timing.ts';
import { serviceClient } from '../_shared/supabase.ts';

type Db = ReturnType<typeof serviceClient>;
const AGENT_SELECT = '*, business_city:cities!business_city_id(*)';

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
  return u ? { id: u.id as string, role: u.role as string } : { id: data.user.id, role: 'trip_manager' };
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
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const KYC_STATES = ['pending', 'docs_submitted', 'video_pending', 'approved', 'rejected', 'resubmit_required'] as const;
function csv(v: string | null): string[] {
  return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

const handler = withTiming('agents', async (req: Request): Promise<Response> => {
  const pre = corsPreflight(req);
  if (pre) return pre;
  const db = serviceClient();
  const url = new URL(req.url);
  const m = url.pathname.match(/\/agents(?:\/(.+))?$/);
  const segs = (m && m[1] ? m[1] : '').split('/').filter(Boolean);
  const id = segs[0];
  const sub = segs[1]; // 'kyc'

  async function fullAgent(agentId: string): Promise<Response> {
    const { data, error } = await db.from('trip_managers').select(AGENT_SELECT).eq('id', agentId).maybeSingle();
    if (error) return fail('DB_ERROR', error.message, 500);
    if (!data) return fail('NOT_FOUND', 'Agent not found', 404);
    return ok(data);
  }
  async function syncRole(userId: string): Promise<void> {
    const { data: u } = await db.from('users').select('role').eq('id', userId).maybeSingle();
    if (u && u.role !== 'admin' && u.role !== 'trip_manager') await db.from('users').update({ role: 'trip_manager' }).eq('id', userId);
  }

  // ── GET /agents (list) ───────────────────────────────────────────────────
  if (!id && req.method === 'GET') {
    let q = db.from('trip_managers').select(AGENT_SELECT);
    const city = url.searchParams.get('business_city_id');
    if (city) q = q.eq('business_city_id', city);
    const kyc = csv(url.searchParams.get('kyc_status'));
    if (kyc.length === 1) q = q.eq('kyc_status', kyc[0]);
    else if (kyc.length > 1) q = q.in('kyc_status', kyc);
    const limit = Number(url.searchParams.get('limit') ?? '50');
    q = q.order('created_at', { ascending: false }).limit(Math.min(Number.isFinite(limit) ? limit : 50, 200));
    const { data, error } = await q;
    if (error) return fail('DB_ERROR', error.message, 500);
    return ok(data ?? []);
  }

  // ── POST /agents (create my agent profile) ───────────────────────────────
  if (!id && req.method === 'POST') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', 'Sign in to create a profile', 401);
    const b = await readBody(req);
    const { data: usr } = await db.from('users').select('phone, email, display_name').eq('id', u.id).maybeSingle();
    const { data: existing } = await db.from('trip_managers').select('id').eq('user_id', u.id).maybeSingle();
    if (existing) {
      await syncRole(u.id);
      return fullAgent(existing.id as string);
    }
    const insert = {
      user_id: u.id,
      full_name: str(b.full_name) || str(usr?.display_name),
      phone: str(b.phone) || str(usr?.phone),
      email: typeof b.email === 'string' ? strOrNull(b.email) : (usr?.email as string | null) ?? null,
      business_name: strOrNull(b.business_name),
      business_city_id: strOrNull(b.business_city_id),
      profile_photo_url: str(b.profile_photo_url),
    };
    const { data: created, error } = await db.from('trip_managers').insert(insert).select('id').single();
    if (error) return pgFail(error);
    await syncRole(u.id);
    return fullAgent(created.id as string);
  }

  if (!id) return fail('NOT_FOUND', 'No such route', 404);

  // ── GET /agents/me (the caller's own agent profile) ──────────────────────
  if (id === 'me' && req.method === 'GET') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', 'Sign in to view your profile', 401);
    const { data, error } = await db.from('trip_managers').select(AGENT_SELECT).eq('user_id', u.id).maybeSingle();
    if (error) return fail('DB_ERROR', error.message, 500);
    if (!data) return fail('NOT_FOUND', 'No agent profile yet — create one with POST /agents', 404);
    return ok(data);
  }

  const { data: tm } = await db.from('trip_managers').select('id, user_id').eq('id', id).maybeSingle();

  // ── GET /agents/:id ──────────────────────────────────────────────────────
  if (!sub && req.method === 'GET') {
    if (!tm) return fail('NOT_FOUND', 'Agent not found', 404);
    return fullAgent(id);
  }

  // ── PATCH /agents/:id/kyc (admin — the KYC review workflow) ──────────────
  if (sub === 'kyc' && (req.method === 'PATCH' || req.method === 'PUT' || req.method === 'POST')) {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', '', 401);
    if (!isAdmin(u)) return fail('FORBIDDEN', 'Admin only', 403);
    if (!tm) return fail('NOT_FOUND', 'Agent not found', 404);
    const b = await readBody(req);
    const next = str(b.kyc_status);
    if (!(KYC_STATES as readonly string[]).includes(next)) return fail('VALIDATION', `kyc_status must be one of ${KYC_STATES.join(', ')}`, 422);
    const { error } = await db.from('trip_managers').update({ kyc_status: next }).eq('id', id);
    if (error) return pgFail(error);
    await db.from('notifications').insert({
      user_id: tm.user_id as string,
      type: 'kyc_status_change',
      title: 'KYC update',
      body: next === 'approved' ? 'Your KYC has been approved.' : next === 'rejected' ? 'Your KYC was rejected.' : next === 'resubmit_required' ? 'Please re-submit your KYC documents.' : `Your KYC status is now "${next}".`,
      payload_json: { kyc_status: next, kind: 'agent', ...(strOrNull(b.note) ? { note: strOrNull(b.note) } : {}) },
    });
    return fullAgent(id);
  }

  // ── PATCH /agents/:id (owner/admin) ──────────────────────────────────────
  if (!sub && (req.method === 'PATCH' || req.method === 'PUT')) {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', '', 401);
    if (!tm) return fail('NOT_FOUND', 'Agent not found', 404);
    if ((tm.user_id as string) !== u.id && !isAdmin(u)) return fail('FORBIDDEN', 'Not your profile', 403);
    const b = await readBody(req);
    const patch = pick(b, ['full_name', 'email', 'business_name', 'business_city_id', 'profile_photo_url']);
    if (Object.keys(patch).length === 0) return fail('VALIDATION', 'Nothing to update', 422);
    const { error } = await db.from('trip_managers').update(patch).eq('id', id);
    if (error) return pgFail(error);
    return fullAgent(id);
  }

  return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed`, 405);
});

serve(handler);
