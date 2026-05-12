/**
 * /drivers/* — driver marketplace profiles (public reads; owner/admin writes) plus the
 * "create my driver/agent profile" route that turns a fresh sign-in (which only created the
 * `users` row) into a driver — or, with role='trip_manager', an agent. Bearer-validated for
 * writes; withTiming; verify_jwt = false (mirrors the RLS "drivers read / owner-or-admin
 * write" policy in migration 002). The /agents function is the trip-manager twin
 * (supabase/functions/agents/index.ts).
 *
 *   GET   /drivers                  ?current_city_id=&kyc_status=&limit=   (public; kyc_status accepts a CSV — the admin KYC queue)
 *   GET   /drivers/me               (Bearer) — the caller's own driver profile (joined; +verification block; 404 if none)
 *   POST  /drivers                  (Bearer) — create my profile; user_id = caller; body.role='trip_manager' → an agent; idempotent
 *   GET   /drivers/:id              (public) — joins home/current city + vehicle summaries (private KYC fields stripped unless owner/admin)
 *   PATCH /drivers/:id              (owner/admin; Bearer) — full_name, email, home_city_id, current_city_id, profile_photo_url
 *   PATCH /drivers/:id/location     (owner; Bearer) — current_city_id, current_lat, current_lng, current_location_at
 *   POST  /drivers/:id/kyc-doc-upload-url (owner; Bearer) — { doc_type } → short-lived signed UPLOAD url into the private 'driver-kyc' bucket
 *   POST  /drivers/:id/kyc-docs     (owner; Bearer) — { aadhaar_front_path, aadhaar_back_path, aadhaar_last4, driver_license_path, driver_license_number, driver_license_expiry, selfie_path, consent } → kyc_status pending|resubmit_required → docs_submitted
 *   GET   /drivers/:id/kyc-docs     (owner/admin; Bearer) — 5-min signed download urls for Aadhaar f/b, DL, selfie + masked-4 + DL number/expiry
 *   PATCH /drivers/:id/kyc          (admin; Bearer) — { kyc_status, note? } — moves the KYC workflow + records reviewer/at + rejection reason + fires a kyc_status_change notification
 */
// @ts-expect-error — Deno std, resolved at runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsPreflight, ok, fail } from '../_shared/cors.ts';
import { withTiming } from '../_shared/timing.ts';
import { serviceClient } from '../_shared/supabase.ts';

type Db = ReturnType<typeof serviceClient>;
type Row = Record<string, unknown>;
const DRIVER_SELECT =
  '*, home_city:cities!home_city_id(*), current_city:cities!current_city_id(*), ' +
  'vehicles(id, year, seats, ac, is_primary, is_active, registration_number, make:vehicle_makes(name), model:vehicle_models(name), car_type:car_types(label))';
const AGENT_SELECT = '*, business_city:cities!business_city_id(*)';

// fields that must not be exposed to anyone other than the owning driver or an admin
const PRIVATE_KYC_FIELDS = [
  'aadhaar_number_masked', 'aadhaar_front_path', 'aadhaar_back_path',
  'driver_license_number', 'driver_license_path', 'driver_license_expiry',
  'selfie_path', 'kyc_consent_at', 'kyc_reviewed_by', 'kyc_rejection_reason',
] as const;
const DOC_TYPES = ['aadhaar_front', 'aadhaar_back', 'driver_license', 'selfie'] as const;
type DocType = (typeof DOC_TYPES)[number];
const DOC_TYPE_TO_PATH_COL: Record<DocType, string> = {
  aadhaar_front: 'aadhaar_front_path',
  aadhaar_back: 'aadhaar_back_path',
  driver_license: 'driver_license_path',
  selfie: 'selfie_path',
};
const REQUIRED_VEHICLE_PHOTO_COLS = [
  'photo_front_url', 'photo_back_url', 'photo_left_url', 'photo_right_url', 'photo_plate_url', 'rc_book_url', 'insurance_url',
] as const;
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
  return u ? { id: u.id as string, role: u.role as string } : { id: data.user.id, role: 'driver' };
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
const stripPrivateKyc = (drv: Row): Row => {
  const out = { ...drv };
  for (const f of PRIVATE_KYC_FIELDS) delete out[f];
  return out;
};

/** server-computed onboarding/verification summary — the client just renders this. */
async function buildVerification(db: Db, drv: Row): Promise<Row> {
  const kycStatus = str(drv.kyc_status) || 'pending';
  const driverId = str(drv.id);
  const hasAllDocs = !!(drv.aadhaar_front_path && drv.aadhaar_back_path && drv.driver_license_path && drv.selfie_path);
  const documents = kycStatus === 'resubmit_required' ? 'action_needed' : hasAllDocs ? 'done' : 'todo';

  const { data: vehs } = await db.from('vehicles').select('*').eq('driver_id', driverId).eq('is_active', true);
  const vehicles = (vehs ?? []) as Row[];
  const chosen = vehicles.find((v) => v.is_primary) ?? vehicles[0] ?? null;
  const vehiclePhotosDone = !!chosen && REQUIRED_VEHICLE_PHOTO_COLS.every((c) => typeof chosen[c] === 'string' && (chosen[c] as string).length > 0);

  const { data: vvRows } = await db.from('video_verifications')
    .select('id, status, scheduled_at, meeting_url, outcome')
    .eq('driver_id', driverId).order('created_at', { ascending: false }).limit(1);
  const vv = (vvRows && vvRows[0]) ? (vvRows[0] as Row) : null;
  const videoCall = kycStatus === 'approved' ? 'done'
    : vv && vv.status === 'scheduled' ? 'scheduled'
    : vv && vv.status === 'completed' && vv.outcome === 'approved' ? 'done'
    : 'todo';

  const details = str(drv.full_name) && drv.home_city_id ? 'done' : 'todo';
  const steps = {
    details,
    documents,
    vehicle: vehicles.length > 0 ? 'done' : 'todo',
    vehicle_photos: vehiclePhotosDone ? 'done' : 'todo',
    video_call: videoCall,
  } as const;
  const stepsDone = Object.values(steps).filter((s) => s === 'done').length;
  return {
    kyc_status: kycStatus,
    steps,
    steps_done: stepsDone,
    steps_total: 5,
    video_verification: vv,
    kyc_rejection_reason: (drv.kyc_rejection_reason as string | null) ?? null,
  };
}

const handler = withTiming('drivers', async (req: Request): Promise<Response> => {
  const pre = corsPreflight(req);
  if (pre) return pre;
  const db = serviceClient();
  const url = new URL(req.url);
  const m = url.pathname.match(/\/drivers(?:\/(.+))?$/);
  const segs = (m && m[1] ? m[1] : '').split('/').filter(Boolean);
  const id = segs[0];
  const sub = segs[1]; // 'location' | 'kyc' | 'kyc-docs' | 'kyc-doc-upload-url'

  async function fetchDriver(driverId: string): Promise<Row | null> {
    const { data, error } = await db.from('drivers').select(DRIVER_SELECT).eq('id', driverId).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Row) ?? null;
  }
  /** owner/admin → full record + verification block; otherwise private KYC fields stripped & no verification. */
  async function respondDriver(driverId: string, privileged: boolean): Promise<Response> {
    let data: Row | null;
    try { data = await fetchDriver(driverId); } catch (e) { return fail('DB_ERROR', String(e), 500); }
    if (!data) return fail('NOT_FOUND', 'Driver not found', 404);
    if (privileged) return ok({ ...data, verification: await buildVerification(db, data) });
    return ok(stripPrivateKyc(data));
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

  // ── GET /drivers (list — public; private KYC fields stripped) ─────────────
  if (!id && req.method === 'GET') {
    let q = db.from('drivers').select(DRIVER_SELECT);
    const city = url.searchParams.get('current_city_id');
    if (city) q = q.eq('current_city_id', city);
    const kyc = csv(url.searchParams.get('kyc_status'));
    if (kyc.length === 1) q = q.eq('kyc_status', kyc[0]);
    else if (kyc.length > 1) q = q.in('kyc_status', kyc);
    const limit = Number(url.searchParams.get('limit') ?? '50');
    q = q.order('rating_avg', { ascending: false }).order('created_at', { ascending: false }).limit(Math.min(Number.isFinite(limit) ? limit : 50, 200));
    const { data, error } = await q;
    if (error) return fail('DB_ERROR', error.message, 500);
    // the admin KYC queue passes a kyc_status filter + Bearer — give admins the full rows
    const u = await authUser(db, req);
    const rows = (data ?? []) as Row[];
    return ok(isAdmin(u) ? rows : rows.map(stripPrivateKyc));
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
      if (existing) { await syncRole(u.id, 'trip_manager'); return fullAgent(existing.id as string); }
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
    if (existing) { await syncRole(u.id, 'driver'); return respondDriver(existing.id as string, true); }
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
    return respondDriver(created.id as string, true);
  }

  if (!id) return fail('NOT_FOUND', 'No such route', 404);

  // ── GET /drivers/me (the caller's own driver profile + verification block) ─
  if (id === 'me' && req.method === 'GET') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', 'Sign in to view your profile', 401);
    const { data, error } = await db.from('drivers').select('id').eq('user_id', u.id).maybeSingle();
    if (error) return fail('DB_ERROR', error.message, 500);
    if (!data) return fail('NOT_FOUND', 'No driver profile yet — create one with POST /drivers', 404);
    return respondDriver(data.id as string, true);
  }

  // load the driver for ownership / 404
  const { data: drv } = await db.from('drivers').select('id, user_id').eq('id', id).maybeSingle();

  // ── GET /drivers/:id ─────────────────────────────────────────────────────
  if (!sub && req.method === 'GET') {
    if (!drv) return fail('NOT_FOUND', 'Driver not found', 404);
    const u = await authUser(db, req);
    const privileged = !!u && (u.id === (drv.user_id as string) || isAdmin(u));
    return respondDriver(id, privileged);
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
    return respondDriver(id, true);
  }

  // ── POST /drivers/:id/kyc-doc-upload-url (owner) — signed UPLOAD url ──────
  if (sub === 'kyc-doc-upload-url' && req.method === 'POST') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', '', 401);
    if (ownerId !== u.id) return fail('FORBIDDEN', 'Not your profile', 403);
    const b = await readBody(req);
    const docType = str(b.doc_type) as DocType;
    if (!(DOC_TYPES as readonly string[]).includes(docType)) return fail('VALIDATION', `doc_type must be one of ${DOC_TYPES.join(', ')}`, 422);
    const path = `${id}/${docType}`;
    const { data, error } = await db.storage.from('driver-kyc').createSignedUploadUrl(path, { upsert: true });
    if (error || !data) return fail('STORAGE_ERROR', error?.message ?? 'could not create upload url', 500);
    return ok({ bucket: 'driver-kyc', path, signed_url: data.signedUrl, token: data.token, path_col: DOC_TYPE_TO_PATH_COL[docType] });
  }

  // ── GET /drivers/:id/kyc-docs (owner/admin) — 5-min signed DOWNLOAD urls ──
  if (sub === 'kyc-docs' && req.method === 'GET') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', '', 401);
    if (ownerId !== u.id && !isAdmin(u)) return fail('FORBIDDEN', 'Not your profile', 403);
    const { data: full } = await db.from('drivers')
      .select('aadhaar_number_masked, aadhaar_front_path, aadhaar_back_path, driver_license_number, driver_license_path, driver_license_expiry, selfie_path, kyc_docs_submitted_at')
      .eq('id', id).maybeSingle();
    const f = (full ?? {}) as Row;
    const signed = async (p: unknown): Promise<string | null> => {
      if (typeof p !== 'string' || !p) return null;
      const { data } = await db.storage.from('driver-kyc').createSignedUrl(p, 300);
      return data?.signedUrl ?? null;
    };
    return ok({
      aadhaar_number_masked: f.aadhaar_number_masked ?? null,
      driver_license_number: f.driver_license_number ?? null,
      driver_license_expiry: f.driver_license_expiry ?? null,
      kyc_docs_submitted_at: f.kyc_docs_submitted_at ?? null,
      aadhaar_front_url: await signed(f.aadhaar_front_path),
      aadhaar_back_url: await signed(f.aadhaar_back_path),
      driver_license_url: await signed(f.driver_license_path),
      selfie_url: await signed(f.selfie_path),
    });
  }

  // ── POST /drivers/:id/kyc-docs (owner) — submit docs → docs_submitted ────
  if (sub === 'kyc-docs' && req.method === 'POST') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', '', 401);
    if (ownerId !== u.id) return fail('FORBIDDEN', 'Not your profile', 403);
    const b = await readBody(req);
    if (b.consent !== true) return fail('VALIDATION', 'You must accept the document-upload consent', 422);
    const aadhaarFront = strOrNull(b.aadhaar_front_path);
    const aadhaarBack = strOrNull(b.aadhaar_back_path);
    const dlPath = strOrNull(b.driver_license_path);
    const selfiePath = strOrNull(b.selfie_path);
    if (!aadhaarFront || !aadhaarBack || !dlPath || !selfiePath) return fail('VALIDATION', 'aadhaar_front_path, aadhaar_back_path, driver_license_path and selfie_path are all required', 422);
    const last4 = str(b.aadhaar_last4).replace(/\D/g, '');
    if (last4.length !== 4) return fail('VALIDATION', 'aadhaar_last4 must be the last 4 digits of the Aadhaar number', 422);
    const dlNumber = strOrNull(b.driver_license_number);
    if (!dlNumber) return fail('VALIDATION', 'driver_license_number is required', 422);
    // safety: paths must live under this driver's folder
    for (const p of [aadhaarFront, aadhaarBack, dlPath, selfiePath]) {
      if (!p.startsWith(`${id}/`)) return fail('VALIDATION', 'document paths must be under your own folder', 422);
    }
    const now = new Date().toISOString();
    const { data: cur } = await db.from('drivers').select('kyc_status').eq('id', id).maybeSingle();
    const curStatus = str(cur?.kyc_status) || 'pending';
    const nextStatus = curStatus === 'pending' || curStatus === 'resubmit_required' ? 'docs_submitted' : curStatus;
    const patch: Row = {
      aadhaar_number_masked: `••••${last4}`,
      aadhaar_front_path: aadhaarFront,
      aadhaar_back_path: aadhaarBack,
      driver_license_path: dlPath,
      driver_license_number: dlNumber,
      driver_license_expiry: strOrNull(b.driver_license_expiry),
      selfie_path: selfiePath,
      kyc_consent_at: now,
      kyc_docs_submitted_at: now,
      kyc_status: nextStatus,
      kyc_rejection_reason: null,
    };
    const { error } = await db.from('drivers').update(patch).eq('id', id);
    if (error) return pgFail(error);
    return respondDriver(id, true);
  }

  // ── PATCH /drivers/:id/kyc (admin — the KYC review workflow) ─────────────
  if (sub === 'kyc' && (req.method === 'PATCH' || req.method === 'PUT' || req.method === 'POST')) {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', '', 401);
    if (!isAdmin(u)) return fail('FORBIDDEN', 'Admin only', 403);
    const b = await readBody(req);
    const next = str(b.kyc_status);
    if (!(KYC_STATES as readonly string[]).includes(next)) return fail('VALIDATION', `kyc_status must be one of ${KYC_STATES.join(', ')}`, 422);
    const reason = next === 'rejected' || next === 'resubmit_required' ? strOrNull(b.note) : null;
    const { error } = await db.from('drivers').update({
      kyc_status: next, kyc_reviewed_by: u.id, kyc_reviewed_at: new Date().toISOString(), kyc_rejection_reason: reason,
    }).eq('id', id);
    if (error) return pgFail(error);
    await db.from('notifications').insert({
      user_id: ownerId,
      type: 'kyc_status_change',
      title: 'KYC update',
      body: next === 'approved' ? 'Your KYC has been approved — you can now apply to and post trips.'
        : next === 'rejected' ? `Your KYC was rejected.${reason ? ' ' + reason : ''}`
        : next === 'resubmit_required' ? `Please re-submit your KYC documents.${reason ? ' ' + reason : ''}`
        : `Your KYC status is now "${next}".`,
      payload_json: { kyc_status: next, kind: 'driver', ...(reason ? { note: reason } : {}) },
    });
    return respondDriver(id, true);
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
    return respondDriver(id, true);
  }

  return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed`, 405);
});

serve(handler);
