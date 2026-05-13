/**
 * /agents/* — agent (trip-manager) marketplace profiles. The twin of /drivers/*
 * (supabase/functions/drivers/index.ts); `agents` ≙ the `trip_managers` table. Public reads;
 * owner/admin writes (Bearer-validated); withTiming; verify_jwt = false (mirrors the RLS
 * "trip_managers read / owner-or-admin write" policy in migration 002). Managers get a lighter
 * KYC than drivers: Aadhaar (front+back) + selfie + a video call — no driving licence, no vehicle.
 *
 *   GET   /agents                  ?business_city_id=&kyc_status=&active=&include_inactive=&limit=   (public; kyc_status CSV — admin queue; defaults to is_active=true — ?active=false lists only deactivated, ?include_inactive=true lists all)
 *   GET   /agents/me               (Bearer) — caller's own agent profile (joined; +verification block; returned even when deactivated, with is_active:false; 404 if none)
 *   POST  /agents                  (Bearer) — create my agent profile; user_id = caller; users.role → trip_manager; idempotent
 *   GET   /agents/:id              (public) — joins business city (private KYC fields stripped unless owner/admin); 404 for a deactivated profile unless the caller is its owner or an admin
 *   PATCH /agents/:id              (owner/admin; Bearer) — full_name, email, business_name, business_city_id, profile_photo_url
 *   PATCH /agents/:id/active       (admin; Bearer) — { is_active, reason? } — the deactivation kill switch (audit-logged + an account_status_change notification); a deactivated agent can't post trips or leave reviews, and is excluded from public lists
 *   POST  /agents/:id/kyc-doc-upload-url (owner; Bearer) — { doc_type: aadhaar_front|aadhaar_back|selfie } → signed UPLOAD url into 'manager-kyc'
 *   POST  /agents/:id/kyc-docs     (owner; Bearer) — { aadhaar_front_path, aadhaar_back_path, aadhaar_last4, selfie_path, consent } → kyc_status pending|resubmit_required → docs_submitted
 *   GET   /agents/:id/kyc-docs     (owner/admin; Bearer) — 5-min signed download urls for Aadhaar f/b + selfie + masked-4
 *   PATCH /agents/:id/kyc          (admin; Bearer) — { kyc_status, note? } — moves the KYC workflow + records reviewer/at + reason + kyc_status_change notification
 */
// @ts-expect-error — Deno std, resolved at runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsPreflight, ok, fail } from '../_shared/cors.ts';
import { withTiming } from '../_shared/timing.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { withCache, tagCacheHit } from '../_shared/withCache.ts';
import { cacheDelete } from '../_shared/cache.ts';

const CACHE_EPOCH = 'v1';
function invalidateAgentMe(userId: string): void {
  cacheDelete(`agents:me:user-${userId}:${CACHE_EPOCH}`);
}

type Db = ReturnType<typeof serviceClient>;
type Row = Record<string, unknown>;
const AGENT_SELECT = '*, business_city:cities!business_city_id(*)';
const PRIVATE_KYC_FIELDS = [
  'aadhaar_number_masked', 'aadhaar_front_path', 'aadhaar_back_path', 'selfie_path',
  'kyc_consent_at', 'kyc_reviewed_by', 'kyc_rejection_reason',
] as const;
const DOC_TYPES = ['aadhaar_front', 'aadhaar_back', 'selfie'] as const;
type DocType = (typeof DOC_TYPES)[number];
const DOC_TYPE_TO_PATH_COL: Record<DocType, string> = {
  aadhaar_front: 'aadhaar_front_path',
  aadhaar_back: 'aadhaar_back_path',
  selfie: 'selfie_path',
};
const KYC_STATES = ['pending', 'docs_submitted', 'video_pending', 'approved', 'rejected', 'resubmit_required'] as const;

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
async function readBody(req: Request): Promise<Row> {
  try {
    const b = await req.json();
    return b && typeof b === 'object' ? (b as Row) : {};
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
function pick(src: Row, keys: string[]): Row {
  const out: Row = {};
  for (const k of keys) if (src[k] !== undefined) out[k] = src[k];
  return out;
}
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const csv = (v: string | null): string[] => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
const stripPrivateKyc = (a: Row): Row => {
  const out = { ...a };
  for (const f of PRIVATE_KYC_FIELDS) delete out[f];
  return out;
};

async function buildVerification(db: Db, tm: Row): Promise<Row> {
  const kycStatus = str(tm.kyc_status) || 'pending';
  const managerId = str(tm.id);
  const hasAllDocs = !!(tm.aadhaar_front_path && tm.aadhaar_back_path && tm.selfie_path);
  const documents = kycStatus === 'resubmit_required' ? 'action_needed' : hasAllDocs ? 'done' : 'todo';
  const { data: vvRows } = await db.from('video_verifications')
    .select('id, status, scheduled_at, meeting_url, outcome')
    .eq('manager_id', managerId).order('created_at', { ascending: false }).limit(1);
  const vv = (vvRows && vvRows[0]) ? (vvRows[0] as Row) : null;
  const videoCall = kycStatus === 'approved' ? 'done'
    : vv && vv.status === 'scheduled' ? 'scheduled'
    : vv && vv.status === 'completed' && vv.outcome === 'approved' ? 'done'
    : 'todo';
  const details = str(tm.full_name) && tm.business_city_id ? 'done' : 'todo';
  const steps = { details, documents, video_call: videoCall } as const;
  const stepsDone = Object.values(steps).filter((s) => s === 'done').length;
  return {
    kyc_status: kycStatus,
    steps,
    steps_done: stepsDone,
    steps_total: 3,
    video_verification: vv,
    kyc_rejection_reason: (tm.kyc_rejection_reason as string | null) ?? null,
  };
}

const handler = withTiming('agents', async (req: Request): Promise<Response> => {
  const pre = corsPreflight(req);
  if (pre) return pre;
  const db = serviceClient();
  const url = new URL(req.url);
  const m = url.pathname.match(/\/agents(?:\/(.+))?$/);
  const segs = (m && m[1] ? m[1] : '').split('/').filter(Boolean);
  const id = segs[0];
  const sub = segs[1]; // 'kyc' | 'kyc-docs' | 'kyc-doc-upload-url'

  async function fetchAgent(agentId: string): Promise<Row | null> {
    const { data, error } = await db.from('trip_managers').select(AGENT_SELECT).eq('id', agentId).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Row) ?? null;
  }
  async function respondAgent(agentId: string, privileged: boolean): Promise<Response> {
    let data: Row | null;
    try { data = await fetchAgent(agentId); } catch (e) { return fail('DB_ERROR', String(e), 500); }
    if (!data) return fail('NOT_FOUND', 'Agent not found', 404);
    if (privileged) return ok({ ...data, verification: await buildVerification(db, data) });
    return ok(stripPrivateKyc(data));
  }
  async function syncRole(userId: string): Promise<void> {
    const { data: u } = await db.from('users').select('role').eq('id', userId).maybeSingle();
    if (u && u.role !== 'admin' && u.role !== 'trip_manager') await db.from('users').update({ role: 'trip_manager' }).eq('id', userId);
  }

  // ── GET /agents (list — public; private KYC stripped, full rows for admins) ─
  if (!id && req.method === 'GET') {
    let q = db.from('trip_managers').select(AGENT_SELECT);
    const city = url.searchParams.get('business_city_id');
    if (city) q = q.eq('business_city_id', city);
    const kyc = csv(url.searchParams.get('kyc_status'));
    if (kyc.length === 1) q = q.eq('kyc_status', kyc[0]);
    else if (kyc.length > 1) q = q.in('kyc_status', kyc);
    // is_active filter — default to active-only; ?active=false → only deactivated; ?include_inactive=true → all
    const activeParam = url.searchParams.get('active');
    if (activeParam === 'false') q = q.eq('is_active', false);
    else if (url.searchParams.get('include_inactive') !== 'true') q = q.eq('is_active', true);
    const limit = Number(url.searchParams.get('limit') ?? '50');
    q = q.order('created_at', { ascending: false }).limit(Math.min(Number.isFinite(limit) ? limit : 50, 200));
    const { data, error } = await q;
    if (error) return fail('DB_ERROR', error.message, 500);
    const u = await authUser(db, req);
    const rows = (data ?? []) as Row[];
    return ok(isAdmin(u) ? rows : rows.map(stripPrivateKyc));
  }

  // ── POST /agents (create my agent profile) ───────────────────────────────
  if (!id && req.method === 'POST') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', 'Sign in to create a profile', 401);
    const b = await readBody(req);
    const { data: usr } = await db.from('users').select('phone, email, display_name').eq('id', u.id).maybeSingle();
    const { data: existing } = await db.from('trip_managers').select('id').eq('user_id', u.id).maybeSingle();
    if (existing) { await syncRole(u.id); return respondAgent(existing.id as string, true); }
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
    return respondAgent(created.id as string, true);
  }

  if (!id) return fail('NOT_FOUND', 'No such route', 404);

  // ── GET /agents/me (caller's own agent profile + verification block) ─────
  if (id === 'me' && req.method === 'GET') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', 'Sign in to view your profile', 401);
    const { data: payload, hit } = await withCache<{ ok: true; body: unknown } | { ok: false }>(
      { key: `agents:me:user-${u.id}:${CACHE_EPOCH}`, ttl: 60, tier: 'memory' },
      async () => {
        const { data, error } = await db.from('trip_managers').select('id').eq('user_id', u.id).maybeSingle();
        if (error) throw new Error(error.message);
        if (!data) return { ok: false };
        const row = await fetchAgent(data.id as string);
        if (!row) return { ok: false };
        return { ok: true, body: { ...row, verification: await buildVerification(db, row) } };
      },
    );
    if (!payload.ok) return fail('NOT_FOUND', 'No agent profile yet — create one with POST /agents', 404);
    return tagCacheHit(ok(payload.body), hit);
  }

  const { data: tm } = await db.from('trip_managers').select('id, user_id, is_active').eq('id', id).maybeSingle();

  // ── GET /agents/:id ──────────────────────────────────────────────────────
  if (!sub && req.method === 'GET') {
    if (!tm) return fail('NOT_FOUND', 'Agent not found', 404);
    const u = await authUser(db, req);
    const privileged = !!u && (u.id === (tm.user_id as string) || isAdmin(u));
    // a deactivated profile is invisible to everyone but its owner and admins
    if (tm.is_active === false && !privileged) return fail('NOT_FOUND', 'Agent not found', 404);
    return respondAgent(id, privileged);
  }

  if (!tm) return fail('NOT_FOUND', 'Agent not found', 404);
  const ownerId = tm.user_id as string;

  // ── POST /agents/:id/kyc-doc-upload-url (owner) ──────────────────────────
  if (sub === 'kyc-doc-upload-url' && req.method === 'POST') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', '', 401);
    if (ownerId !== u.id) return fail('FORBIDDEN', 'Not your profile', 403);
    const b = await readBody(req);
    const docType = str(b.doc_type) as DocType;
    if (!(DOC_TYPES as readonly string[]).includes(docType)) return fail('VALIDATION', `doc_type must be one of ${DOC_TYPES.join(', ')}`, 422);
    const path = `${id}/${docType}`;
    const { data, error } = await db.storage.from('manager-kyc').createSignedUploadUrl(path, { upsert: true });
    if (error || !data) return fail('STORAGE_ERROR', error?.message ?? 'could not create upload url', 500);
    return ok({ bucket: 'manager-kyc', path, signed_url: data.signedUrl, token: data.token, path_col: DOC_TYPE_TO_PATH_COL[docType] });
  }

  // ── GET /agents/:id/kyc-docs (owner/admin) ───────────────────────────────
  if (sub === 'kyc-docs' && req.method === 'GET') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', '', 401);
    if (ownerId !== u.id && !isAdmin(u)) return fail('FORBIDDEN', 'Not your profile', 403);
    const { data: full } = await db.from('trip_managers')
      .select('aadhaar_number_masked, aadhaar_front_path, aadhaar_back_path, selfie_path, kyc_docs_submitted_at')
      .eq('id', id).maybeSingle();
    const f = (full ?? {}) as Row;
    const signed = async (p: unknown): Promise<string | null> => {
      if (typeof p !== 'string' || !p) return null;
      const { data } = await db.storage.from('manager-kyc').createSignedUrl(p, 300);
      return data?.signedUrl ?? null;
    };
    return ok({
      aadhaar_number_masked: f.aadhaar_number_masked ?? null,
      kyc_docs_submitted_at: f.kyc_docs_submitted_at ?? null,
      aadhaar_front_url: await signed(f.aadhaar_front_path),
      aadhaar_back_url: await signed(f.aadhaar_back_path),
      selfie_url: await signed(f.selfie_path),
    });
  }

  // ── POST /agents/:id/kyc-docs (owner) ────────────────────────────────────
  if (sub === 'kyc-docs' && req.method === 'POST') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', '', 401);
    if (ownerId !== u.id) return fail('FORBIDDEN', 'Not your profile', 403);
    const b = await readBody(req);
    if (b.consent !== true) return fail('VALIDATION', 'You must accept the document-upload consent', 422);
    const aadhaarFront = strOrNull(b.aadhaar_front_path);
    const aadhaarBack = strOrNull(b.aadhaar_back_path);
    const selfiePath = strOrNull(b.selfie_path);
    if (!aadhaarFront || !aadhaarBack || !selfiePath) return fail('VALIDATION', 'aadhaar_front_path, aadhaar_back_path and selfie_path are all required', 422);
    const last4 = str(b.aadhaar_last4).replace(/\D/g, '');
    if (last4.length !== 4) return fail('VALIDATION', 'aadhaar_last4 must be the last 4 digits of the Aadhaar number', 422);
    for (const p of [aadhaarFront, aadhaarBack, selfiePath]) {
      if (!p.startsWith(`${id}/`)) return fail('VALIDATION', 'document paths must be under your own folder', 422);
    }
    const now = new Date().toISOString();
    const { data: cur } = await db.from('trip_managers').select('kyc_status').eq('id', id).maybeSingle();
    const curStatus = str(cur?.kyc_status) || 'pending';
    const nextStatus = curStatus === 'pending' || curStatus === 'resubmit_required' ? 'docs_submitted' : curStatus;
    const { error } = await db.from('trip_managers').update({
      aadhaar_number_masked: `••••${last4}`,
      aadhaar_front_path: aadhaarFront,
      aadhaar_back_path: aadhaarBack,
      selfie_path: selfiePath,
      kyc_consent_at: now,
      kyc_docs_submitted_at: now,
      kyc_status: nextStatus,
      kyc_rejection_reason: null,
    }).eq('id', id);
    if (error) return pgFail(error);
    invalidateAgentMe(ownerId);
    return respondAgent(id, true);
  }

  // ── PATCH /agents/:id/kyc (admin — the KYC review workflow) ──────────────
  if (sub === 'kyc' && (req.method === 'PATCH' || req.method === 'PUT' || req.method === 'POST')) {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', '', 401);
    if (!isAdmin(u)) return fail('FORBIDDEN', 'Admin only', 403);
    const b = await readBody(req);
    const next = str(b.kyc_status);
    if (!(KYC_STATES as readonly string[]).includes(next)) return fail('VALIDATION', `kyc_status must be one of ${KYC_STATES.join(', ')}`, 422);
    const reason = next === 'rejected' || next === 'resubmit_required' ? strOrNull(b.note) : null;
    const { error } = await db.from('trip_managers').update({
      kyc_status: next, kyc_reviewed_by: u.id, kyc_reviewed_at: new Date().toISOString(), kyc_rejection_reason: reason,
    }).eq('id', id);
    if (error) return pgFail(error);
    await db.from('notifications').insert({
      user_id: ownerId,
      type: 'kyc_status_change',
      title: 'KYC update',
      body: next === 'approved' ? 'Your KYC has been approved — you can now post trips.'
        : next === 'rejected' ? `Your KYC was rejected.${reason ? ' ' + reason : ''}`
        : next === 'resubmit_required' ? `Please re-submit your KYC documents.${reason ? ' ' + reason : ''}`
        : `Your KYC status is now "${next}".`,
      payload_json: { kyc_status: next, kind: 'agent', ...(reason ? { note: reason } : {}) },
    });
    invalidateAgentMe(ownerId);
    return respondAgent(id, true);
  }

  // ── PATCH /agents/:id/active (admin — deactivate / reactivate an agent) ──
  // The `is_active` kill switch: a deactivated agent can't post trips or leave reviews; their profile
  // 404s for non-owners; they drop out of public lists. In-flight trips are intentionally left alone.
  // Orthogonal to kyc_status.
  if (sub === 'active' && (req.method === 'PATCH' || req.method === 'PUT' || req.method === 'POST')) {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', '', 401);
    if (!isAdmin(u)) return fail('FORBIDDEN', 'Admin only', 403);
    const b = await readBody(req);
    if (typeof b.is_active !== 'boolean') return fail('VALIDATION', 'is_active (true|false) is required', 422);
    const reason = b.is_active ? null : strOrNull(b.reason);
    const { data: before } = await db.from('trip_managers').select('is_active, deactivated_at, deactivation_reason, deactivated_by').eq('id', id).maybeSingle();
    const now = new Date().toISOString();
    const { error } = await db.from('trip_managers').update({
      is_active: b.is_active,
      deactivated_at: b.is_active ? null : now,
      deactivation_reason: reason,
      deactivated_by: b.is_active ? null : u.id,
    }).eq('id', id);
    if (error) return pgFail(error);
    await db.from('admin_audit_log').insert({
      actor_user_id: u.id, action: b.is_active ? 'reactivate' : 'deactivate', entity: 'trip_managers', entity_id: id,
      before_json: before ?? null, after_json: { is_active: b.is_active, ...(reason ? { reason } : {}) },
    });
    await db.from('notifications').insert({
      user_id: ownerId,
      type: 'account_status_change',
      title: b.is_active ? 'Account reactivated' : 'Account deactivated',
      body: b.is_active
        ? 'Your agent account has been reactivated — you can post trips again.'
        : `Your agent account has been deactivated by an administrator.${reason ? ' ' + reason : ''} Contact support if you think this is a mistake.`,
      payload_json: { is_active: b.is_active, kind: 'agent', ...(reason ? { reason } : {}) },
    });
    invalidateAgentMe(ownerId);
    return respondAgent(id, true);
  }

  // ── PATCH /agents/:id (owner/admin) ──────────────────────────────────────
  if (!sub && (req.method === 'PATCH' || req.method === 'PUT')) {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', '', 401);
    if (ownerId !== u.id && !isAdmin(u)) return fail('FORBIDDEN', 'Not your profile', 403);
    const b = await readBody(req);
    const patch = pick(b, ['full_name', 'email', 'business_name', 'business_city_id', 'profile_photo_url']);
    if (Object.keys(patch).length === 0) return fail('VALIDATION', 'Nothing to update', 422);
    const { error } = await db.from('trip_managers').update(patch).eq('id', id);
    if (error) return pgFail(error);
    invalidateAgentMe(ownerId);
    return respondAgent(id, true);
  }

  return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed`, 405);
});

serve(handler);
