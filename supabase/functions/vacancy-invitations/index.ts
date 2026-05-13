/**
 * /vacancy-invitations/* — agents invite a vacancy-posting driver to one of their open trips. The
 * driver accepts (which inserts a `trip_acceptances` row = the reveal gate) or declines. Both sides
 * see the other's full PII only after the invitation is accepted. withTiming; verify_jwt = false
 * (the function validates the Bearer). Mirrors the migration-023 RLS "driver/agent read theirs +
 * admin read all + admin write" policy — the predicates for agent-owned reads / driver-owned
 * writes live in this function.
 *
 *   GET   /vacancy-invitations              (Bearer) — ?role=driver returns mine-received,
 *                                           ?role=agent returns mine-sent, default both.
 *                                           Admin sees all. Joins trip/vacancy/driver(redacted-by-step-2)/inviter user handle.
 *   POST  /vacancy-invitations              (agent — Bearer; rate-limited 20/10min) — body { vacancy_id, trip_id, message? }.
 *                                           Caller must own the trip (posted_by_user_id = caller); the trip must be open|has_applicants;
 *                                           the vacancy's driver must be is_active + KYC-approved. INSERTs the row + fires a
 *                                           `trip_invitation` notification to the driver. Unique (vacancy_id, trip_id) ⇒ 409 on duplicate.
 *   PATCH /vacancy-invitations/:id          (driver — Bearer; admin allowed) — body { status: 'accepted' | 'declined' }.
 *                                           On 'accepted': INSERT a trip_acceptances row (status 'applied') — that's the reveal gate.
 *                                           Fires an invitation_accepted | invitation_declined notification to the inviting agent.
 *                                           Pre-existing trip_acceptances (the driver already applied) ⇒ idempotent (no second insert).
 */
// @ts-expect-error — Deno std, resolved at runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsPreflight, ok, fail } from '../_shared/cors.ts';
import { withTiming } from '../_shared/timing.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { rateLimitOk } from '../_shared/rateLimit.ts';
import { redactDriver } from '../_shared/pii.ts';

type Db = ReturnType<typeof serviceClient>;
type Row = Record<string, unknown>;

const INVITE_SELECT =
  '*, ' +
  'inviter:users!invited_by_user_id(id, display_handle, display_name), ' +
  'driver:drivers!driver_id(id, user_id, full_name, phone, email, profile_photo_url, rating_avg, rating_count, total_trips_completed, user:users!user_id(display_handle)), ' +
  'trip:trips!trip_id(id, status, pickup_at, expected_distance_km, total_fare, driver_payout, from_city:cities!from_city_id(*), to_city:cities!to_city_id(*)), ' +
  'vacancy:vacancies!vacancy_id(id, status, current_city_id, current_city:cities!current_city_id(*))';

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
async function driverIdFor(db: Db, userId: string): Promise<string | null> {
  const { data } = await db.from('drivers').select('id').eq('user_id', userId).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/**
 * Shape the joined row for the response: redact `driver.full_name|phone|email|profile_photo_url`
 * for non-revealed viewers (a *pending* invite is the pre-reveal state by design — the agent invited
 * a HANDLE; only after `accepted` does the standard predicate fire via the new acceptance row).
 *
 * The agent IS the inviter so we don't redact at the inviter side either way (they know who they
 * invited by handle, and once accepted they need name/phone to coordinate — which the next
 * `GET /trips/:id/applicants` round-trip will surface anyway). For consistency with the rest of the
 * PII rules, we always strip driver-side PII here unless `revealDriver=true`, computed by caller.
 */
function shapeInvitation(row: Row, revealDriver: boolean): Row {
  const out = { ...row };
  const drv = out.driver as Row | null | undefined;
  if (drv) {
    const flat: Row = { ...drv };
    const u = flat.user as Row | null | undefined;
    flat.display_handle = u && typeof u.display_handle === 'string' ? u.display_handle : null;
    delete flat.user;
    out.driver = redactDriver(flat as { id: string; user_id: string; [k: string]: unknown }, revealDriver);
  }
  // strip inviter's display_name when the viewer is the driver — they only know the handle pre-accept
  const inv = out.inviter as Row | null | undefined;
  if (inv) {
    out.inviter_handle = typeof inv.display_handle === 'string' ? inv.display_handle : null;
    out.inviter_name = typeof inv.display_name === 'string' ? inv.display_name : null;
    delete out.inviter;
  }
  return out;
}

const handler = withTiming('vacancy-invitations', async (req: Request): Promise<Response> => {
  const pre = corsPreflight(req);
  if (pre) return pre;
  const db = serviceClient();
  const url = new URL(req.url);
  const m = url.pathname.match(/\/vacancy-invitations(?:\/(.+))?$/);
  const id = (m && m[1] ? m[1] : '').split('/').filter(Boolean)[0];

  const u = await authUser(db, req);
  if (!u) return fail('UNAUTHORIZED', 'Sign in to manage invitations', 401);

  async function fullInvite(inviteId: string, viewerIsTheAgent: boolean, viewerIsTheDriver: boolean, accepted: boolean): Promise<Response> {
    const { data, error } = await db.from('vacancy_invitations').select(INVITE_SELECT).eq('id', inviteId).maybeSingle();
    if (error) return fail('DB_ERROR', error.message, 500);
    if (!data) return fail('NOT_FOUND', 'Invitation not found', 404);
    // Reveal driver PII only to: admin; the driver themselves; or the agent once accepted.
    const reveal = isAdmin(u) || viewerIsTheDriver || (viewerIsTheAgent && accepted);
    return ok(shapeInvitation(data as Row, reveal));
  }

  // ── GET /vacancy-invitations (the caller's, scoped by role) ───────────────
  if (!id && req.method === 'GET') {
    const role = (url.searchParams.get('role') ?? '').toLowerCase();
    let q = db.from('vacancy_invitations').select(INVITE_SELECT).order('created_at', { ascending: false }).limit(200);
    if (isAdmin(u)) {
      // admin sees all; no extra filter
    } else if (role === 'driver') {
      const did = await driverIdFor(db, u.id);
      if (!did) return ok([]);
      q = q.eq('driver_id', did);
    } else if (role === 'agent') {
      q = q.eq('invited_by_user_id', u.id);
    } else {
      // default: union of mine-received + mine-sent
      const did = await driverIdFor(db, u.id);
      q = did ? q.or(`driver_id.eq.${did},invited_by_user_id.eq.${u.id}`) : q.eq('invited_by_user_id', u.id);
    }
    const { data, error } = await q;
    if (error) return fail('DB_ERROR', error.message, 500);
    const rows = (data ?? []) as Row[];
    const myDriverId = await driverIdFor(db, u.id);
    const shaped = rows.map((r) => {
      const viewerIsTheDriver = myDriverId !== null && r.driver_id === myDriverId;
      const viewerIsTheAgent = r.invited_by_user_id === u.id;
      const accepted = r.status === 'accepted';
      const reveal = isAdmin(u) || viewerIsTheDriver || (viewerIsTheAgent && accepted);
      return shapeInvitation(r, reveal);
    });
    return ok(shaped);
  }

  // ── POST /vacancy-invitations (an agent invites a driver) ─────────────────
  if (!id && req.method === 'POST') {
    if (!(await rateLimitOk(db, `post-invite:${u.id}`, 20, 10 * 60))) return fail('RATE_LIMITED', 'Too many invitations sent — try again shortly', 429);
    const b = await readBody(req);
    const vacancyId = typeof b.vacancy_id === 'string' ? b.vacancy_id : '';
    const tripId = typeof b.trip_id === 'string' ? b.trip_id : '';
    if (!vacancyId || !tripId) return fail('VALIDATION', 'vacancy_id and trip_id are both required', 422);

    // trip must belong to the caller (or admin) + be open|has_applicants
    const { data: trip } = await db.from('trips').select('id, posted_by_user_id, status').eq('id', tripId).maybeSingle();
    if (!trip) return fail('NOT_FOUND', 'Trip not found', 404);
    if (!isAdmin(u) && (trip.posted_by_user_id as string) !== u.id) return fail('FORBIDDEN', 'Only the trip poster can invite a driver', 403);
    const tripStatus = trip.status as string;
    if (tripStatus !== 'open' && tripStatus !== 'has_applicants') return fail('CONFLICT', `Trip is "${tripStatus}" — can only invite while open or has_applicants`, 409);

    // vacancy must exist + driver must be active + KYC-approved
    const { data: vac } = await db.from('vacancies').select('id, driver_id, status').eq('id', vacancyId).maybeSingle();
    if (!vac) return fail('NOT_FOUND', 'Vacancy not found', 404);
    const driverId = vac.driver_id as string;
    const { data: drv } = await db.from('drivers').select('user_id, is_active, kyc_status').eq('id', driverId).maybeSingle();
    if (!drv) return fail('NOT_FOUND', 'Driver not found', 404);
    if (drv.is_active === false) return fail('VALIDATION', 'That driver is deactivated — pick another vacancy', 422);
    if ((drv.kyc_status as string) !== 'approved') return fail('VALIDATION', 'That driver has not completed KYC yet', 422);

    const message = typeof b.message === 'string' ? b.message : null;
    const { data: created, error } = await db.from('vacancy_invitations').insert({
      vacancy_id: vacancyId,
      trip_id: tripId,
      invited_by_user_id: u.id,
      driver_id: driverId,
      message,
      status: 'pending',
    }).select('id').single();
    if (error) return pgFail(error); // 23505 (vacancy_id, trip_id) → 409 already invited

    // fire a trip_invitation notification to the driver (best-effort; never fails the POST)
    try {
      await db.from('notifications').insert({
        user_id: drv.user_id,
        type: 'trip_invitation',
        title: 'You’ve been invited to a trip',
        body: message || 'An agent invited you to drive a trip — open the app to review.',
        payload_json: { invitation_id: created.id, trip_id: tripId, vacancy_id: vacancyId, invited_by_user_id: u.id },
      });
    } catch { /* ignore */ }

    return fullInvite(created.id as string, true, false, false);
  }

  if (!id) return fail('NOT_FOUND', 'No such route', 404);

  // ── PATCH /vacancy-invitations/:id (the driver accepts or declines) ───────
  if (req.method === 'PATCH' || req.method === 'PUT') {
    const { data: inv } = await db.from('vacancy_invitations').select('id, vacancy_id, trip_id, invited_by_user_id, driver_id, status').eq('id', id).maybeSingle();
    if (!inv) return fail('NOT_FOUND', 'Invitation not found', 404);
    const myDriverId = await driverIdFor(db, u.id);
    const isTheDriver = myDriverId !== null && (inv.driver_id as string) === myDriverId;
    if (!isTheDriver && !isAdmin(u)) return fail('FORBIDDEN', 'Only the invited driver can decide', 403);
    if (inv.status !== 'pending') return fail('CONFLICT', `Invitation is already "${inv.status}"`, 409);

    const b = await readBody(req);
    const next = b.status === 'accepted' || b.status === 'declined' ? (b.status as 'accepted' | 'declined') : null;
    if (!next) return fail('VALIDATION', 'status must be "accepted" or "declined"', 422);

    const now = new Date().toISOString();
    const { error: upErr } = await db.from('vacancy_invitations').update({ status: next, decided_at: now }).eq('id', id);
    if (upErr) return pgFail(upErr);

    if (next === 'accepted') {
      // INSERT a trip_acceptances row — that's the reveal gate (per can_reveal_driver / can_reveal_agent).
      // The driver may already have an applied row from an earlier direct apply ⇒ unique (trip_id, driver_id)
      // hits 23505; that's idempotent — treat as success.
      const { error: accErr } = await db.from('trip_acceptances').insert({
        trip_id: inv.trip_id,
        driver_id: inv.driver_id,
        status: 'applied',
        applicant_message: 'Accepted invitation',
      });
      if (accErr && accErr.code !== '23505') {
        // roll back the invitation status — couldn't seal the gate
        await db.from('vacancy_invitations').update({ status: 'pending', decided_at: null }).eq('id', id);
        return pgFail(accErr);
      }
      await db.from('trips').update({ status: 'has_applicants' }).eq('id', inv.trip_id).eq('status', 'open');
    }

    // notify the inviter (best-effort)
    try {
      await db.from('notifications').insert({
        user_id: inv.invited_by_user_id,
        type: next === 'accepted' ? 'invitation_accepted' : 'invitation_declined',
        title: next === 'accepted' ? 'Invitation accepted' : 'Invitation declined',
        body: next === 'accepted'
          ? 'A driver accepted your trip invitation — open the trip to coordinate.'
          : 'A driver declined your invitation.',
        payload_json: { invitation_id: id, trip_id: inv.trip_id, vacancy_id: inv.vacancy_id, driver_id: inv.driver_id, status: next },
      });
    } catch { /* ignore */ }

    return fullInvite(id, (inv.invited_by_user_id as string) === u.id, isTheDriver, next === 'accepted');
  }

  // ── GET /vacancy-invitations/:id ─────────────────────────────────────────
  if (req.method === 'GET') {
    const { data: inv } = await db.from('vacancy_invitations').select('id, driver_id, invited_by_user_id, status').eq('id', id).maybeSingle();
    if (!inv) return fail('NOT_FOUND', 'Invitation not found', 404);
    const myDriverId = await driverIdFor(db, u.id);
    const isTheDriver = myDriverId !== null && (inv.driver_id as string) === myDriverId;
    const isTheAgent = (inv.invited_by_user_id as string) === u.id;
    if (!isTheDriver && !isTheAgent && !isAdmin(u)) return fail('FORBIDDEN', 'Not your invitation', 403);
    return fullInvite(id, isTheAgent, isTheDriver, inv.status === 'accepted');
  }

  return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed`, 405);
});

serve(handler);
