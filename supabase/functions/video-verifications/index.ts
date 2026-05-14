/**
 * /video-verifications/* — the KYC video-call step. A driver or trip-manager (whose
 * kyc_status is 'docs_submitted') books a 15-min slot from the admin-defined recurring
 * windows (video_call_availability); booking flips their kyc_status to 'video_pending' and
 * creates a row with a Jitsi meeting URL. An admin runs the call from the Video Call Console
 * and finalizes it (the three gates: face match / documents / liveness) → on outcome
 * 'approved' the subject's kyc_status flips to 'approved' and a kyc_status_change notification
 * fires. withTiming; verify_jwt = false (mirrors the RLS in migration 008).
 *
 *   GET   /video-verifications/available-slots         (authed) — next ~14 days of free 15-min slots
 *   POST  /video-verifications  { slot_at }            (authed driver/manager) — book → kyc_status video_pending
 *   GET   /video-verifications/:id                     (owner/admin/conductor) — one row
 *   PATCH /video-verifications/:id { cancel:true } | { reschedule_to: ISO } | { no_show:true (admin) }
 *   PATCH /video-verifications/:id/finalize  { outcome, face_match_confirmed, documents_confirmed, liveness_check_passed, notes? }  (admin)
 *   GET   /video-verifications  ?status=&from=&to=     (admin) — the console list (joins driver/manager + city)
 */
// @ts-expect-error — Deno std, resolved at runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsPreflight, ok, fail } from '../_shared/cors.ts';
import { withTiming } from '../_shared/timing.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { authUser, isAdmin } from '../_shared/auth.ts';
import { readBody, pgFail as pgFailShared } from '../_shared/http.ts';
import { maybePromoteToReadyForApproval } from '../_shared/kyc.ts';

const pgFail = (e: { code?: string; message: string }) =>
  pgFailShared(e, { dupMessage: 'You already have a video call scheduled' });

type Db = ReturnType<typeof serviceClient>;
type Row = Record<string, unknown>;
const IST_OFFSET = '+05:30';
const VV_SELECT =
  '*, driver:drivers!driver_id(id, full_name, phone, kyc_status, home_city:cities!home_city_id(name)), ' +
  'manager:trip_managers!manager_id(id, full_name, phone, kyc_status, business_city:cities!business_city_id(name))';
const OUTCOMES = ['approved', 'rejected', 'resubmit_required'] as const;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const istDateStr = (d: Date): string => new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(0, 10);
const hhmm = (t: string): [number, number] => { const [h, m] = String(t).slice(0, 5).split(':').map(Number); return [h || 0, m || 0]; };

/**
 * The caller's driver/manager subject row, or null. Pass `prefer` when the user has
 * both profiles (admins acting via the role switcher) — without it, drivers win,
 * which would block an admin trying to verify their agent profile.
 */
async function subjectFor(db: Db, userId: string, prefer?: 'driver' | 'manager'): Promise<{ kind: 'driver' | 'manager'; id: string; userId: string; kycStatus: string } | null> {
  async function asDriver() {
    const { data } = await db.from('drivers').select('id, user_id, kyc_status').eq('user_id', userId).maybeSingle();
    return data ? { kind: 'driver' as const, id: data.id as string, userId, kycStatus: str(data.kyc_status) || 'pending' } : null;
  }
  async function asManager() {
    const { data } = await db.from('trip_managers').select('id, user_id, kyc_status').eq('user_id', userId).maybeSingle();
    return data ? { kind: 'manager' as const, id: data.id as string, userId, kycStatus: str(data.kyc_status) || 'pending' } : null;
  }
  if (prefer === 'manager') return (await asManager()) ?? (await asDriver());
  if (prefer === 'driver') return (await asDriver()) ?? (await asManager());
  return (await asDriver()) ?? (await asManager());
}
async function setSubjectKyc(db: Db, kind: 'driver' | 'manager', subjectId: string, patch: Row): Promise<void> {
  await db.from(kind === 'driver' ? 'drivers' : 'trip_managers').update(patch).eq('id', subjectId);
}

async function generateSlots(db: Db): Promise<{ slot_at: string; slot_minutes: number }[]> {
  const { data: windows } = await db.from('video_call_availability').select('weekday, start_time, end_time, slot_minutes').eq('is_active', true);
  const wins = (windows ?? []) as Row[];
  if (wins.length === 0) return [];
  const now = Date.now();
  const minLead = now + 60 * 60_000; // at least 1h out
  const { data: booked } = await db.from('video_verifications').select('scheduled_at').eq('status', 'scheduled').gte('scheduled_at', new Date(now).toISOString());
  const taken = new Set((booked ?? []).map((b) => new Date(String((b as Row).scheduled_at)).getTime()));
  const out: { slot_at: string; slot_minutes: number }[] = [];
  for (let day = 0; day < 14 && out.length < 60; day++) {
    const date = istDateStr(new Date(now + day * 86_400_000));
    const weekday = new Date(`${date}T12:00:00${IST_OFFSET}`).getUTCDay();
    for (const w of wins) {
      if (Number(w.weekday) !== weekday) continue;
      const step = (Number(w.slot_minutes) || 15);
      const [sh, sm] = hhmm(String(w.start_time));
      const [eh, em] = hhmm(String(w.end_time));
      const endMin = eh * 60 + em;
      for (let cur = sh * 60 + sm; cur + step <= endMin; cur += step) {
        const h = Math.floor(cur / 60), mnt = cur % 60;
        const iso = new Date(`${date}T${String(h).padStart(2, '0')}:${String(mnt).padStart(2, '0')}:00${IST_OFFSET}`);
        const t = iso.getTime();
        if (t < minLead || taken.has(t)) continue;
        out.push({ slot_at: iso.toISOString(), slot_minutes: step });
      }
    }
  }
  return out.sort((a, b) => a.slot_at.localeCompare(b.slot_at)).slice(0, 60);
}

const handler = withTiming('video-verifications', async (req: Request): Promise<Response> => {
  const pre = corsPreflight(req);
  if (pre) return pre;
  const db = serviceClient();
  const url = new URL(req.url);
  const m = url.pathname.match(/\/video-verifications(?:\/(.+))?$/);
  const segs = (m && m[1] ? m[1] : '').split('/').filter(Boolean);
  const id = segs[0]; // ':id' or 'available-slots'
  const sub = segs[1]; // 'finalize'

  async function returnRow(rowId: string): Promise<Response> {
    const { data, error } = await db.from('video_verifications').select(VV_SELECT).eq('id', rowId).maybeSingle();
    if (error) return fail('DB_ERROR', error.message, 500);
    if (!data) return fail('NOT_FOUND', 'Not found', 404);
    return ok(data);
  }

  // ── GET /video-verifications/available-slots (authed) ────────────────────
  if (id === 'available-slots' && req.method === 'GET') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', 'Sign in to see slots', 401);
    return ok(await generateSlots(db));
  }

  // ── GET /video-verifications (admin console list) ────────────────────────
  if (!id && req.method === 'GET') {
    const u = await authUser(db, req);
    if (!isAdmin(u)) return fail('FORBIDDEN', 'Admin only', 403);
    let q = db.from('video_verifications').select(VV_SELECT).order('scheduled_at', { ascending: true });
    const st = url.searchParams.get('status');
    if (st) q = q.in('status', st.split(',').map((s) => s.trim()).filter(Boolean));
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    if (from) q = q.gte('scheduled_at', from);
    if (to) q = q.lte('scheduled_at', to);
    q = q.limit(500);
    const { data, error } = await q;
    if (error) return fail('DB_ERROR', error.message, 500);
    return ok(data ?? []);
  }

  // ── POST /video-verifications (book a slot) ──────────────────────────────
  if (!id && req.method === 'POST') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', 'Sign in to book a video call', 401);
    const b = await readBody(req);
    const preferRaw = str(b.kind);
    const prefer = preferRaw === 'driver' || preferRaw === 'manager' ? preferRaw : undefined;
    const subj = await subjectFor(db, u.id, prefer);
    if (!subj) return fail('FORBIDDEN', 'Create your profile first', 403);
    if (subj.kycStatus === 'approved') return fail('VALIDATION', `Your ${subj.kind === 'manager' ? 'agent' : 'driver'} KYC is already approved`, 422);
    if (subj.kycStatus === 'video_pending') return fail('CONFLICT', 'You already have a video call scheduled', 409);
    if (subj.kycStatus !== 'docs_submitted') return fail('VALIDATION', 'Submit your documents (KYC) before booking the video call', 422);
    const slotAt = str(b.slot_at);
    const parsed = slotAt ? new Date(slotAt) : null;
    if (!parsed || isNaN(parsed.getTime())) return fail('VALIDATION', 'slot_at must be an ISO timestamp', 422);
    const valid = await generateSlots(db);
    const match = valid.find((s) => new Date(s.slot_at).getTime() === parsed.getTime());
    if (!match) return fail('VALIDATION', 'That slot is no longer available — pick another', 409);
    const insert: Row = subj.kind === 'driver' ? { driver_id: subj.id } : { manager_id: subj.id };
    insert.status = 'scheduled';
    insert.scheduled_at = parsed.toISOString();
    insert.slot_minutes = match.slot_minutes;
    insert.meeting_provider = 'jitsi';
    const { data: created, error } = await db.from('video_verifications').insert(insert).select('id').single();
    if (error) return pgFail(error);
    const rowId = created.id as string;
    await db.from('video_verifications').update({ meeting_url: `https://meet.jit.si/tripking-${rowId}` }).eq('id', rowId);
    await setSubjectKyc(db, subj.kind, subj.id, { kyc_status: 'video_pending' });
    return returnRow(rowId);
  }

  if (!id) return fail('NOT_FOUND', 'No such route', 404);

  // load the row + ownership
  const { data: vv } = await db.from('video_verifications').select('*').eq('id', id).maybeSingle();
  if (!vv) return fail('NOT_FOUND', 'Not found', 404);
  const row = vv as Row;
  const kind: 'driver' | 'manager' = row.driver_id ? 'driver' : 'manager';
  const subjectId = String(row.driver_id ?? row.manager_id);
  const { data: subjRow } = await db.from(kind === 'driver' ? 'drivers' : 'trip_managers').select('id, user_id, kyc_status').eq('id', subjectId).maybeSingle();
  const subjectUserId = String((subjRow as Row | null)?.user_id ?? '');

  // ── GET /video-verifications/:id (owner / conductor / admin) ─────────────
  if (!sub && req.method === 'GET') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', '', 401);
    if (u.id !== subjectUserId && u.id !== row.conducted_by && !isAdmin(u)) return fail('FORBIDDEN', 'Not yours', 403);
    return returnRow(id);
  }

  // ── PATCH /video-verifications/:id/finalize (admin) ─────────────────────
  if (sub === 'finalize' && (req.method === 'PATCH' || req.method === 'PUT' || req.method === 'POST')) {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', '', 401);
    if (!isAdmin(u)) return fail('FORBIDDEN', 'Admin only', 403);
    if (row.status !== 'scheduled') return fail('VALIDATION', `Call is already ${row.status}`, 422);
    const b = await readBody(req);
    const outcome = str(b.outcome);
    if (!(OUTCOMES as readonly string[]).includes(outcome)) return fail('VALIDATION', `outcome must be one of ${OUTCOMES.join(', ')}`, 422);
    const face = b.face_match_confirmed === true;
    const docs = b.documents_confirmed === true;
    const live = b.liveness_check_passed === true;
    if (outcome === 'approved' && !(face && docs && live)) return fail('VALIDATION', 'To approve, all three checks (face match / documents / liveness) must pass', 422);
    const now = new Date().toISOString();
    const notes = typeof b.notes === 'string' ? (b.notes as string) : null;
    const { error } = await db.from('video_verifications').update({
      status: 'completed', conducted_by: u.id, conducted_at: now,
      face_match_confirmed: face, documents_confirmed: docs, liveness_check_passed: live, outcome, notes,
    }).eq('id', id);
    if (error) return pgFail(error);
    // Positive outcome no longer auto-approves: it puts the subject in `ready_for_approval`
    // (admin confirms with one click in the KYC detail page). Negative outcomes still terminate.
    if (outcome === 'approved') {
      await setSubjectKyc(db, kind, subjectId, { kyc_status: 'video_pending', kyc_reviewed_by: u.id, kyc_reviewed_at: now, kyc_rejection_reason: null });
      await maybePromoteToReadyForApproval(db, kind, subjectId);
    } else {
      const newKyc = outcome === 'rejected' ? 'rejected' : 'resubmit_required';
      await setSubjectKyc(db, kind, subjectId, { kyc_status: newKyc, kyc_reviewed_by: u.id, kyc_reviewed_at: now, kyc_rejection_reason: notes });
    }
    const { data: after } = await db.from(kind === 'driver' ? 'drivers' : 'trip_managers').select('kyc_status').eq('id', subjectId).maybeSingle();
    const finalKyc = str((after as Row | null)?.kyc_status);
    if (subjectUserId) {
      await db.from('notifications').insert({
        user_id: subjectUserId,
        type: 'kyc_status_change',
        title: 'Video verification complete',
        body: outcome === 'approved'
          ? finalKyc === 'ready_for_approval'
            ? 'Your video call passed — an admin will approve your KYC shortly.'
            : 'Your video call passed — finish the remaining checklist steps to complete KYC.'
          : outcome === 'rejected' ? `Your video verification was not successful.${notes ? ' ' + notes : ''}`
          : `Please re-submit your documents.${notes ? ' ' + notes : ''}`,
        payload_json: { kyc_status: finalKyc, kind: kind === 'driver' ? 'driver' : 'agent', video_verification_id: id, ...(notes ? { note: notes } : {}) },
      });
    }
    return returnRow(id);
  }

  // ── PATCH /video-verifications/:id/status (admin — manually flip status/outcome) ─
  // For off-platform calls or to re-open / re-finalize a row. Audit-trail handled by
  // standard timing logs; this does NOT loop through finalize gates.
  if (sub === 'status' && (req.method === 'PATCH' || req.method === 'PUT' || req.method === 'POST')) {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', '', 401);
    if (!isAdmin(u)) return fail('FORBIDDEN', 'Admin only', 403);
    const b = await readBody(req);
    const VV_STATUSES = ['scheduled', 'completed', 'cancelled', 'no_show'] as const;
    const nextStatus = str(b.status);
    const nextOutcome = b.outcome === null ? null : str(b.outcome);
    const adminNotes = typeof b.notes === 'string' ? (b.notes as string) : null;
    if (nextStatus && !(VV_STATUSES as readonly string[]).includes(nextStatus)) {
      return fail('VALIDATION', `status must be one of ${VV_STATUSES.join(', ')}`, 422);
    }
    if (nextOutcome && !(OUTCOMES as readonly string[]).includes(nextOutcome)) {
      return fail('VALIDATION', `outcome must be one of ${OUTCOMES.join(', ')} or null`, 422);
    }
    const patch: Row = {};
    if (nextStatus) patch.status = nextStatus;
    if (b.outcome !== undefined) patch.outcome = nextOutcome;
    if (adminNotes !== null) patch.notes = adminNotes;
    if (nextStatus === 'completed' && !row.conducted_at) {
      patch.conducted_by = u.id;
      patch.conducted_at = new Date().toISOString();
    }
    if (Object.keys(patch).length === 0) return fail('VALIDATION', 'send status, outcome or notes', 422);
    const { error } = await db.from('video_verifications').update(patch).eq('id', id);
    if (error) return pgFail(error);
    // Mirror subject kyc_status as needed
    const effStatus = nextStatus || str(row.status);
    const effOutcome = b.outcome !== undefined ? nextOutcome : (row.outcome ? str(row.outcome) : null);
    if (effStatus === 'completed' && effOutcome === 'approved') {
      await setSubjectKyc(db, kind, subjectId, { kyc_status: 'video_pending', kyc_reviewed_by: u.id, kyc_reviewed_at: new Date().toISOString(), kyc_rejection_reason: null });
      await maybePromoteToReadyForApproval(db, kind, subjectId);
    } else if (effStatus === 'completed' && effOutcome === 'rejected') {
      await setSubjectKyc(db, kind, subjectId, { kyc_status: 'rejected', kyc_reviewed_by: u.id, kyc_reviewed_at: new Date().toISOString(), kyc_rejection_reason: adminNotes });
    } else if (effStatus === 'completed' && effOutcome === 'resubmit_required') {
      await setSubjectKyc(db, kind, subjectId, { kyc_status: 'resubmit_required', kyc_reviewed_by: u.id, kyc_reviewed_at: new Date().toISOString(), kyc_rejection_reason: adminNotes });
    } else if ((effStatus === 'cancelled' || effStatus === 'no_show') && str(row.status) !== effStatus) {
      const subjKyc = str((subjRow as Row | null)?.kyc_status);
      if (subjKyc === 'video_pending' || subjKyc === 'ready_for_approval') {
        await setSubjectKyc(db, kind, subjectId, { kyc_status: 'docs_submitted' });
      }
    }
    return returnRow(id);
  }

  // ── PATCH /video-verifications/:id  (owner cancel/reschedule; admin no-show) ─
  if (!sub && (req.method === 'PATCH' || req.method === 'PUT')) {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', '', 401);
    const owner = u.id === subjectUserId;
    if (!owner && !isAdmin(u)) return fail('FORBIDDEN', 'Not yours', 403);
    if (row.status !== 'scheduled') return fail('VALIDATION', `Call is already ${row.status}`, 422);
    const b = await readBody(req);

    if (b.cancel === true) {
      const { error } = await db.from('video_verifications').update({ status: 'cancelled' }).eq('id', id);
      if (error) return pgFail(error);
      { const k = (subjRow as Row | null)?.kyc_status; if (k === 'video_pending' || k === 'ready_for_approval') await setSubjectKyc(db, kind, subjectId, { kyc_status: 'docs_submitted' }); }
      return returnRow(id);
    }
    if (isAdmin(u) && b.no_show === true) {
      const { error } = await db.from('video_verifications').update({ status: 'no_show' }).eq('id', id);
      if (error) return pgFail(error);
      { const k = (subjRow as Row | null)?.kyc_status; if (k === 'video_pending' || k === 'ready_for_approval') await setSubjectKyc(db, kind, subjectId, { kyc_status: 'docs_submitted' }); }
      return returnRow(id);
    }
    if (typeof b.reschedule_to === 'string') {
      if (!owner) return fail('FORBIDDEN', 'Only the subject can reschedule', 403);
      const parsed = new Date(b.reschedule_to);
      if (isNaN(parsed.getTime())) return fail('VALIDATION', 'reschedule_to must be an ISO timestamp', 422);
      const valid = await generateSlots(db);
      if (!valid.find((s) => new Date(s.slot_at).getTime() === parsed.getTime())) return fail('VALIDATION', 'That slot is not available', 409);
      const { error } = await db.from('video_verifications').update({ scheduled_at: parsed.toISOString() }).eq('id', id);
      if (error) return pgFail(error);
      return returnRow(id);
    }
    return fail('VALIDATION', 'Send { cancel: true } | { reschedule_to: ISO } | { no_show: true }', 422);
  }

  return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed`, 405);
});

serve(handler);
