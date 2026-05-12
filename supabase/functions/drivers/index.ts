/**
 * /drivers/* — driver marketplace profiles (public reads; owner/admin writes) plus the
 * "create my driver/agent profile" route that turns a fresh sign-in (which only created the
 * `users` row) into a driver — or, with role='trip_manager', an agent. Bearer-validated for
 * writes; withTiming; verify_jwt = false (mirrors the RLS "drivers read / owner-or-admin
 * write" policy in migration 002). The /agents function is the trip-manager twin
 * (supabase/functions/agents/index.ts).
 *
 *   GET   /drivers              ?current_city_id=&kyc_status=&limit=     (public; kyc_status accepts a CSV — the admin KYC queue)
 *   POST  /drivers              (Bearer) — create my profile; user_id = caller; body.role='trip_manager'
 *                               makes an agent profile instead; idempotent (returns the existing one if any)
 *   GET   /drivers/:id          (public) — joins home/current city + vehicle summaries
 *   PATCH /drivers/:id          (owner/admin; Bearer) — full_name, email, home_city_id, current_city_id, profile_photo_url
 *   PATCH /drivers/:id/location (owner; Bearer) — current_city_id, current_lat, current_lng, current_location_at
 *   PATCH /drivers/:id/kyc      (admin; Bearer) — { kyc_status, note? } — moves the KYC workflow + fires a kyc_status_change notification
 */
// @ts-expect-error — Deno std, resolved at runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsPreflight, ok, fail } from '../_shared/cors.ts';
import { withTiming } from '../_shared/timing.ts';
import { serviceClient } from '../_shared/supabase.ts';

type Db = ReturnType<typeof serviceClient>;
const DRIVER_SELECT =
  '*, home_city:cities!home_city_id(*), current_city:cities!current_city_id(*), ' +
  'vehicles(id, year, seats, ac, make:vehicle_makes(name), model:vehicle_models(name), car_type:car_types(label))';
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
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const KYC_STATES = ['pending', 'docs_submitted', 'video_pending', 'approved', 'rejected', 'resubmit_required'] as const;
function csv(v: string | null): string[] {
  return v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

const handler = withTiming('drivers', async (req: Request): Promise<Response> => {
  const pre = corsPreflight(req);
  if (pre) return pre;
  const db = serviceClient();
  const url = new URL(req.url);
  const m = url.pathname.match(/\/drivers(?:\/(.+))?$/);
  const segs = (m && m[1] ? m[1] : '').split('/').filter(Boolean);
  const id = segs[0];
  const sub = segs[1]; // 'location'

  async function fullDriver(driverId: string): Promise<Response> {
    const { data, error } = await db.from('drivers').select(DRIVER_SELECT).eq('id', driverId).maybeSingle();
    if (error) return fail('DB_ERROR', error.message, 500);
    if (!data) return fail('NOT_FOUND', 'Driver not found', 404);
    return ok(data);
  }
  async function fullAgent(agentId: string): Promise<Response> {
    const { data, error } = await db.from('trip_managers').select(AGENT_SELECT).eq('id', agentId).maybeSingle();
    if (error) return fail('DB_ERROR', error.message, 500);
    if (!data) return fail('NOT_FOUND', 'Agent not found', 404);
    return ok(data);
  }
  async function syncRole(userId: string, role: 'driver' | 'trip_manager'): Promise<void> {
    const { data: u } = await db.from('users').select('role').eq('id', userId).maybeSingle();
    if (u && u.role !== 'admin' && u.role !== role) await db.from('users').update({ role }).eq('id', userId);
  }

  // ── GET /drivers (list) ──────────────────────────────────────────────────
  if (!id && req.method === 'GET') {
    let q = db.from('drivers').select(DRIVER_SELECT);
    const city = url.searchParams.get('current_city_id');
    if (city) q = q.eq('current_city_id', city);
    const kyc = csv(url.searchParams.get('kyc_status'));
    if (kyc.length === 1) q = q.eq('kyc_status', kyc[0]);
    else if (kyc.length > 1) q = q.in('kyc_status', kyc);
    const limit = Number(url.searchParams.get('limit') ?? '50');
    q = q
      .order('rating_avg', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(Math.min(Number.isFinite(limit) ? limit : 50, 200));
    const { data, error } = await q;
    if (error) return fail('DB_ERROR', error.message, 500);
    return ok(data ?? []);
  }

  // ── POST /drivers (create my profile; role='trip_manager' → an agent) ────
  if (!id && req.method === 'POST') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', 'Sign in to create a profile', 401);
    const b = await readBody(req);
    const { data: usr } = await db.from('users').select('phone, email, display_name').eq('id', u.id).maybeSingle();
    const wantsAgent = str(b.role) === 'trip_manager';
    if (wantsAgent) {
      const { data: existing } = await db.from('trip_managers').select('id').eq('user_id', u.id).maybeSingle();
      if (existing) {
        await syncRole(u.id, 'trip_manager');
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
      await syncRole(u.id, 'trip_manager');
      return fullAgent(created.id as string);
    }
    const { data: existing } = await db.from('drivers').select('id').eq('user_id', u.id).maybeSingle();
    if (existing) {
      await syncRole(u.id, 'driver');
      return fullDriver(existing.id as string);
    }
    const insert = {
      user_id: u.id,
      full_name: str(b.full_name) || str(usr?.display_name),
      phone: str(b.phone) || str(usr?.phone),
      email: typeof b.email === 'string' ? strOrNull(b.email) : (usr?.email as string | null) ?? null,
      home_city_id: strOrNull(b.home_city_id),
      current_city_id: strOrNull(b.current_city_id) ?? strOrNull(b.home_city_id),
      profile_photo_url: str(b.profile_photo_url),
    };
    const { data: created, error } = await db.from('drivers').insert(insert).select('id').single();
    if (error) return pgFail(error);
    await syncRole(u.id, 'driver');
    return fullDriver(created.id as string);
  }

  if (!id) return fail('NOT_FOUND', 'No such route', 404);

  // load the driver for ownership / 404
  const { data: drv } = await db.from('drivers').select('id, user_id').eq('id', id).maybeSingle();

  // ── GET /drivers/:id ─────────────────────────────────────────────────────
  if (!sub && req.method === 'GET') {
    if (!drv) return fail('NOT_FOUND', 'Driver not found', 404);
    return fullDriver(id);
  }

  if (!drv) return fail('NOT_FOUND', 'Driver not found', 404);
  const ownerId = drv.user_id as string;

  // ── PATCH /drivers/:id/location (owner) ──────────────────────────────────
  if (sub === 'location' && (req.method === 'PATCH' || req.method === 'PUT')) {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', '', 401);
    if (ownerId !== u.id) return fail('FORBIDDEN', 'Only the driver can update their location', 403);
    const b = await readBody(req);
    const patch = pick(b, ['current_city_id', 'current_lat', 'current_lng', 'current_location_at']);
    if (!('current_location_at' in patch)) patch.current_location_at = new Date().toISOString();
    const { error } = await db.from('drivers').update(patch).eq('id', id);
    if (error) return pgFail(error);
    return fullDriver(id);
  }

  // ── PATCH /drivers/:id/kyc (admin — the KYC review workflow) ─────────────
  if (sub === 'kyc' && (req.method === 'PATCH' || req.method === 'PUT' || req.method === 'POST')) {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', '', 401);
    if (!isAdmin(u)) return fail('FORBIDDEN', 'Admin only', 403);
    const b = await readBody(req);
    const next = str(b.kyc_status);
    if (!(KYC_STATES as readonly string[]).includes(next)) return fail('VALIDATION', `kyc_status must be one of ${KYC_STATES.join(', ')}`, 422);
    const { error } = await db.from('drivers').update({ kyc_status: next }).eq('id', id);
    if (error) return pgFail(error);
    await db.from('notifications').insert({
      user_id: ownerId,
      type: 'kyc_status_change',
      title: 'KYC update',
      body: next === 'approved' ? 'Your KYC has been approved.' : next === 'rejected' ? 'Your KYC was rejected.' : next === 'resubmit_required' ? 'Please re-submit your KYC documents.' : `Your KYC status is now "${next}".`,
      payload_json: { kyc_status: next, kind: 'driver', ...(strOrNull(b.note) ? { note: strOrNull(b.note) } : {}) },
    });
    return fullDriver(id);
  }

  // ── PATCH /drivers/:id (owner/admin) ─────────────────────────────────────
  if (!sub && (req.method === 'PATCH' || req.method === 'PUT')) {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', '', 401);
    if (ownerId !== u.id && !isAdmin(u)) return fail('FORBIDDEN', 'Not your profile', 403);
    const b = await readBody(req);
    const patch = pick(b, ['full_name', 'email', 'home_city_id', 'current_city_id', 'profile_photo_url']);
    if (Object.keys(patch).length === 0) return fail('VALIDATION', 'Nothing to update', 422);
    const { error } = await db.from('drivers').update(patch).eq('id', id);
    if (error) return pgFail(error);
    return fullDriver(id);
  }

  return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed`, 405);
});

serve(handler);
