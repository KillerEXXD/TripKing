/**
 * /trips/* — the trip lifecycle. Public reads; authed writes (validates the caller's Bearer
 * JWT via GoTrue, then writes with the service-role client enforcing the same ownership rules
 * the RLS policies encode). Instrumented with withTiming; verify_jwt = false (we validate).
 *
 * Routes (at the function root, i.e. /functions/v1/trips/...):
 *   GET    /trips                       ?status=&from_city_id=&to_city_id=&posted_by_user_id=&limit=   (public)
 *   POST   /trips                       (authed) — total_fare computed if omitted; driver_payout via trigger
 *   GET    /trips/by-otp/:otp           (public — the OTP is the credential) — the passenger portal; joins assigned driver+vehicle;
 *                                       fare fields nulled when show_fare_to_passenger is false; passenger_otp_hash never echoed
 *   GET    /trips/:id                   (public) — joined; passenger_otp_hash stripped
 *   GET    /trips/:id/applicants        (poster/admin) — joins driver+vehicle
 *   POST   /trips/:id/applicants        (driver) — apply; bumps trip → has_applicants
 *   DELETE /trips/:id/applicants/:aid   (owning driver/admin) — withdraw
 *   POST   /trips/:id/applicants/:aid/reject  (poster/admin)
 *   POST   /trips/:id/assign            (poster/admin) { acceptance_id } — selects one, rejects the rest,
 *                                       status → assigned, generates the passenger OTP (returned for dev)
 *   POST   /trips/:id/start             (assigned driver/admin) { passenger_otp, start_odo_* } — verifies OTP → in_progress
 *   POST   /trips/:id/complete          (assigned driver/admin) { end_odo_*, driver_notes }
 *   POST   /trips/:id/cancel            (poster/admin) { cancel_reason_id }
 *
 * Live tracking: every trip row carries the assigned driver (id, name, photo, ratings, and
 * current_lat/current_lng/current_location_at). While a trip is in_progress, the assigned driver
 * pings `PATCH /drivers/:id/location` periodically; the trip row then also gets `distance_to_destination_km`
 * (haversine to the destination city's coords). A trip manager's live map = `GET /trips?status=in_progress&posted_by_user_id=<me>`.
 */
// @ts-expect-error — Deno std, resolved at runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsPreflight, ok, fail } from '../_shared/cors.ts';
import { withTiming } from '../_shared/timing.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { rateLimitOk } from '../_shared/rateLimit.ts';

type Db = ReturnType<typeof serviceClient>;

// includes the assigned driver (with live position) so a trip manager can track an in-progress trip on a map.
const TRIP_SELECT =
  '*, from_city:cities!from_city_id(*), to_city:cities!to_city_id(*), car_type:car_types(label), ' +
  'assigned_driver:drivers!assigned_driver_id(id, full_name, profile_photo_url, rating_avg, rating_count, total_trips_completed, current_lat, current_lng, current_location_at)';
// for the passenger portal (GET /trips/by-otp/:otp) — adds the driver's phone + the assigned vehicle.
const BY_OTP_SELECT =
  '*, from_city:cities!from_city_id(*), to_city:cities!to_city_id(*), car_type:car_types(label), ' +
  'assigned_driver:drivers!assigned_driver_id(id, full_name, phone, profile_photo_url, rating_avg, rating_count, total_trips_completed, current_lat, current_lng, current_location_at), ' +
  'assigned_vehicle:vehicles!assigned_vehicle_id(id, year, seats, ac, make:vehicle_makes(name), model:vehicle_models(name), car_type:car_types(label))';
const ACCEPTANCE_SELECT =
  '*, driver:drivers(id, full_name, profile_photo_url, rating_avg, rating_count, total_trips_completed, top_tags, current_city:cities!current_city_id(*)), ' +
  'vehicle:vehicles(id, year, seats, ac, make:vehicle_makes(name), model:vehicle_models(name), car_type:car_types(label))';

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
async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
const genOtp = () => String(Math.floor(100000 + Math.random() * 900000));
function pgFail(error: { code?: string; message: string }, fallbackStatus = 400): Response {
  if (error.code === '23505') return fail('CONFLICT', error.message, 409);
  if (error.code === '23503') return fail('VALIDATION', error.message, 422);
  if (error.code === '23502' || error.code === '23514' || error.code === '22P02') return fail('VALIDATION', error.message, 422);
  return fail('DB_ERROR', error.message, fallbackStatus);
}
// ── trip-row enrichment (applied to every trip that leaves the API) ──────────
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null;
}
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
/** Strip the passenger-OTP hash (SHA-256 of a 6-digit OTP — brute-forceable) and, for an in-progress
 *  trip with a known assigned-driver position + destination coords, attach `distance_to_destination_km`. */
function enrichTrip(row: Record<string, unknown>): Record<string, unknown> {
  delete row.passenger_otp_hash;
  if (row.status === 'in_progress') {
    const d = row.assigned_driver as Record<string, unknown> | null | undefined;
    const dest = row.to_city as Record<string, unknown> | null | undefined;
    const dLat = num(d?.current_lat);
    const dLng = num(d?.current_lng);
    const tLat = num(dest?.lat);
    const tLng = num(dest?.lng);
    if (dLat != null && dLng != null && tLat != null && tLng != null) {
      row.distance_to_destination_km = Math.round(haversineKm(dLat, dLng, tLat, tLng) * 10) / 10;
    }
  }
  return row;
}

const handler = withTiming('trips', async (req: Request): Promise<Response> => {
  const pre = corsPreflight(req);
  if (pre) return pre;
  const db = serviceClient();
  const url = new URL(req.url);
  // path after the function name `trips`: [] (list) | [id] | [id, 'applicants'] | [id, 'applicants', aid] |
  // [id, 'applicants', aid, 'reject'] | [id, 'assign'|'start'|'complete'|'cancel']
  const m = url.pathname.match(/\/trips(?:\/(.+))?$/);
  const segs = (m && m[1] ? m[1] : '').split('/').filter(Boolean);
  const tripId = segs[0];
  const sub = segs[1]; // applicants | assign | start | complete | cancel
  const acceptanceId = segs[2];
  const subsub = segs[3]; // reject

  async function loadTrip(id: string) {
    const { data } = await db
      .from('trips')
      .select('id, posted_by_user_id, assigned_driver_id, status, passenger_otp_hash')
      .eq('id', id)
      .maybeSingle();
    return data as { id: string; posted_by_user_id: string; assigned_driver_id: string | null; status: string; passenger_otp_hash: string | null } | null;
  }
  async function driverIdFor(userId: string): Promise<string | null> {
    const { data } = await db.from('drivers').select('id').eq('user_id', userId).maybeSingle();
    return (data?.id as string | undefined) ?? null;
  }
  async function fullTrip(id: string) {
    const { data, error } = await db.from('trips').select(TRIP_SELECT).eq('id', id).single();
    if (error) throw new Error(error.message);
    return enrichTrip(data as Record<string, unknown>);
  }

  // ── GET /trips (list) ────────────────────────────────────────────────────
  // Trip-manager "live map": GET /trips?status=in_progress&posted_by_user_id=<me> — each row carries
  // the assigned driver's position + distance_to_destination_km.
  if (!tripId && req.method === 'GET') {
    let q = db.from('trips').select(TRIP_SELECT);
    const status = url.searchParams.get('status');
    if (status) {
      const arr = status.split(',').map((s) => s.trim()).filter(Boolean);
      if (arr.length === 1) q = q.eq('status', arr[0]);
      else if (arr.length > 1) q = q.in('status', arr);
    }
    const fromCity = url.searchParams.get('from_city_id');
    if (fromCity) q = q.eq('from_city_id', fromCity);
    const toCity = url.searchParams.get('to_city_id');
    if (toCity) q = q.eq('to_city_id', toCity);
    const postedBy = url.searchParams.get('posted_by_user_id');
    if (postedBy) q = q.eq('posted_by_user_id', postedBy);
    const limit = Number(url.searchParams.get('limit') ?? '50');
    q = q.order('pickup_at', { ascending: true }).limit(Math.min(Number.isFinite(limit) ? limit : 50, 100));
    const { data, error } = await q;
    if (error) return fail('DB_ERROR', error.message, 500);
    return ok((data ?? []).map((r) => enrichTrip(r as Record<string, unknown>)));
  }

  // ── POST /trips/trips ────────────────────────────────────────────────────
  if (!tripId && req.method === 'POST') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', 'Sign in to post a trip', 401);
    if (!(await rateLimitOk(db, `post-trip:${u.id}`, 60, 60))) return fail('RATE_LIMITED', 'Too many trips posted — try again shortly', 429);
    const b = await readBody(req);
    const fromCityId = String(b.from_city_id ?? '');
    const toCityId = String(b.to_city_id ?? '');
    if (!fromCityId || !toCityId) return fail('VALIDATION', 'from_city_id and to_city_id are required', 422);
    const distance = Number(b.expected_distance_km);
    const rate = Number(b.rate_per_km);
    if (!Number.isFinite(distance) || !Number.isFinite(rate) || !b.pickup_at || !b.car_type_id) {
      return fail('VALIDATION', 'pickup_at, car_type_id, expected_distance_km, rate_per_km are required', 422);
    }
    const totalFare = b.total_fare !== undefined && b.total_fare !== null ? Number(b.total_fare) : Math.round(distance * rate);
    const { data: usr } = await db.from('users').select('display_name, role').eq('id', u.id).maybeSingle();
    const posterRole = usr?.role === 'driver' ? 'driver' : 'trip_manager';
    const insert = {
      posted_by_user_id: u.id,
      posted_by_role: posterRole,
      posted_by_name: (usr?.display_name as string) ?? '',
      posted_by_phone: (b.posted_by_phone as string | null) ?? null,
      from_city_id: fromCityId,
      to_city_id: toCityId,
      pickup_at: b.pickup_at,
      expected_distance_km: distance,
      car_type_id: b.car_type_id,
      seats_required: b.seats_required ?? 4,
      ac_required: b.ac_required ?? true,
      rate_per_km: rate,
      total_fare: totalFare,
      commission_pct: b.commission_pct ?? 10,
      gst_amount: b.gst_amount ?? 0,
      driver_bata: b.driver_bata ?? 300,
      extras_paid_by_passenger: b.extras_paid_by_passenger ?? true,
      driver_instructions: (b.driver_instructions as string | null) ?? null,
      passenger_name: b.passenger_name ?? '',
      passenger_phone: b.passenger_phone ?? '',
      passenger_count: b.passenger_count ?? 1,
      luggage_notes: (b.luggage_notes as string | null) ?? null,
      special_requests: (b.special_requests as string | null) ?? null,
      show_fare_to_passenger: b.show_fare_to_passenger ?? true,
      hide_passenger_phone: b.hide_passenger_phone ?? false,
      status: 'open',
    };
    const { data: created, error } = await db.from('trips').insert(insert).select('id').single();
    if (error) return pgFail(error);
    return ok(await fullTrip(created.id as string));
  }

  if (!tripId) return fail('NOT_FOUND', 'No such route', 404);

  // ── GET /trips/by-otp/:otp (the passenger portal — public; the OTP IS the credential) ──
  if (tripId === 'by-otp' && sub && req.method === 'GET') {
    const otpHash = await sha256hex(decodeURIComponent(sub));
    const { data, error } = await db
      .from('trips')
      .select(BY_OTP_SELECT)
      .eq('passenger_otp_hash', otpHash)
      .order('assigned_at', { ascending: false, nullsFirst: false })
      .limit(1);
    if (error) return fail('DB_ERROR', error.message, 500);
    const row = (data ?? [])[0] as Record<string, unknown> | undefined;
    if (!row) return fail('NOT_FOUND', 'No trip matches that OTP', 404);
    enrichTrip(row); // strips passenger_otp_hash + adds distance_to_destination_km when in_progress
    if (!row.show_fare_to_passenger) {
      for (const k of ['total_fare', 'rate_per_km', 'driver_payout', 'commission_pct', 'gst_amount', 'driver_bata']) row[k] = null;
    }
    return ok(row);
  }

  // ── GET /trips/:id ───────────────────────────────────────────────────────
  if (!sub && req.method === 'GET') {
    const { data, error } = await db.from('trips').select(TRIP_SELECT).eq('id', tripId).maybeSingle();
    if (error) return fail('DB_ERROR', error.message, 500);
    if (!data) return fail('NOT_FOUND', 'Trip not found', 404);
    return ok(enrichTrip(data as Record<string, unknown>));
  }

  // ── /trips/:id/applicants ────────────────────────────────────────────────
  if (sub === 'applicants') {
    if (!acceptanceId && req.method === 'GET') {
      const u = await authUser(db, req);
      const trip = await loadTrip(tripId);
      if (!trip) return fail('NOT_FOUND', 'Trip not found', 404);
      if (!u || (trip.posted_by_user_id !== u.id && !isAdmin(u))) return fail('FORBIDDEN', 'Only the trip poster can see applicants', 403);
      const { data, error } = await db.from('trip_acceptances').select(ACCEPTANCE_SELECT).eq('trip_id', tripId).order('applied_at', { ascending: true });
      if (error) return fail('DB_ERROR', error.message, 500);
      return ok(data ?? []);
    }
    if (!acceptanceId && req.method === 'POST') {
      const u = await authUser(db, req);
      if (!u) return fail('UNAUTHORIZED', 'Sign in to apply', 401);
      if (!(await rateLimitOk(db, `apply-trip:${u.id}`, 120, 60))) return fail('RATE_LIMITED', 'Too many applications — try again shortly', 429);
      const did = await driverIdFor(u.id);
      if (!did) return fail('FORBIDDEN', 'You need a driver profile to apply', 403);
      const b = await readBody(req);
      const { data, error } = await db
        .from('trip_acceptances')
        .insert({ trip_id: tripId, driver_id: did, vehicle_id: (b.vehicle_id as string | null) ?? null, applicant_quoted_rate_per_km: (b.applicant_quoted_rate_per_km as number | null) ?? null, applicant_message: (b.applicant_message as string | null) ?? null, status: 'applied' })
        .select('id')
        .single();
      if (error) return error.code === '23505' ? fail('CONFLICT', 'You already applied to this trip', 409) : pgFail(error);
      await db.from('trips').update({ status: 'has_applicants' }).eq('id', tripId).eq('status', 'open');
      const { data: full } = await db.from('trip_acceptances').select(ACCEPTANCE_SELECT).eq('id', data.id as string).single();
      return ok(full);
    }
    if (acceptanceId && !subsub && req.method === 'DELETE') {
      const u = await authUser(db, req);
      if (!u) return fail('UNAUTHORIZED', '', 401);
      const did = await driverIdFor(u.id);
      const { data: acc } = await db.from('trip_acceptances').select('id, driver_id').eq('id', acceptanceId).eq('trip_id', tripId).maybeSingle();
      if (!acc) return fail('NOT_FOUND', 'Application not found', 404);
      if (acc.driver_id !== did && !isAdmin(u)) return fail('FORBIDDEN', '', 403);
      const { error } = await db.from('trip_acceptances').update({ status: 'withdrawn', decision_at: new Date().toISOString() }).eq('id', acceptanceId);
      if (error) return pgFail(error);
      return ok({ withdrawn: acceptanceId });
    }
    if (acceptanceId && subsub === 'reject' && req.method === 'POST') {
      const u = await authUser(db, req);
      const trip = await loadTrip(tripId);
      if (!trip) return fail('NOT_FOUND', 'Trip not found', 404);
      if (!u || (trip.posted_by_user_id !== u.id && !isAdmin(u))) return fail('FORBIDDEN', '', 403);
      const b = await readBody(req);
      const { data, error } = await db.from('trip_acceptances').update({ status: 'rejected', decision_at: new Date().toISOString(), decision_note: (b.decision_note as string | null) ?? null }).eq('id', acceptanceId).eq('trip_id', tripId).select(ACCEPTANCE_SELECT).single();
      if (error) return pgFail(error);
      return ok(data);
    }
    return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed`, 405);
  }

  // ── POST /trips/trips/:id/assign ─────────────────────────────────────────
  if (sub === 'assign' && req.method === 'POST') {
    const u = await authUser(db, req);
    const trip = await loadTrip(tripId);
    if (!trip) return fail('NOT_FOUND', 'Trip not found', 404);
    if (!u || (trip.posted_by_user_id !== u.id && !isAdmin(u))) return fail('FORBIDDEN', 'Only the trip poster can assign a driver', 403);
    const b = await readBody(req);
    const aid = String(b.acceptance_id ?? '');
    const { data: acc } = await db.from('trip_acceptances').select('id, driver_id, vehicle_id').eq('id', aid).eq('trip_id', tripId).maybeSingle();
    if (!acc) return fail('VALIDATION', 'acceptance_id not found for this trip', 422);
    const now = new Date().toISOString();
    const otp = genOtp();
    const otpHash = await sha256hex(otp);
    await db.from('trip_acceptances').update({ status: 'rejected', decision_at: now }).eq('trip_id', tripId).neq('id', aid).in('status', ['applied', 'selected']);
    await db.from('trip_acceptances').update({ status: 'selected', decision_at: now }).eq('id', aid);
    const { error } = await db
      .from('trips')
      .update({ status: 'assigned', assigned_driver_id: acc.driver_id, assigned_vehicle_id: (acc.vehicle_id as string | null) ?? null, assigned_acceptance_id: aid, assigned_at: now, passenger_otp_hash: otpHash })
      .eq('id', tripId);
    if (error) return pgFail(error);
    await db.from('trip_executions').upsert({ trip_id: tripId }, { onConflict: 'trip_id', ignoreDuplicates: true });
    const t = await fullTrip(tripId);
    // OTP is delivered out-of-band by the agent; included here for dev convenience (the Trip transform ignores it).
    return ok({ ...(t as Record<string, unknown>), passenger_otp: otp });
  }

  // ── POST /trips/trips/:id/start ──────────────────────────────────────────
  if (sub === 'start' && req.method === 'POST') {
    const u = await authUser(db, req);
    const trip = await loadTrip(tripId);
    if (!trip) return fail('NOT_FOUND', 'Trip not found', 404);
    const did = u ? await driverIdFor(u.id) : null;
    if (!u || (trip.assigned_driver_id !== did && !isAdmin(u))) return fail('FORBIDDEN', 'Only the assigned driver can start the trip', 403);
    if (trip.status !== 'assigned') return fail('CONFLICT', `Trip is "${trip.status}", not "assigned"`, 409);
    const b = await readBody(req);
    const otpHash = await sha256hex(String(b.passenger_otp ?? ''));
    if (!trip.passenger_otp_hash || otpHash !== trip.passenger_otp_hash) return fail('INVALID_OTP', 'Incorrect passenger OTP', 401);
    const now = new Date().toISOString();
    await db.from('trips').update({ status: 'in_progress' }).eq('id', tripId);
    await db.from('trip_executions').upsert(
      { trip_id: tripId, started_at: now, start_odo_url: (b.start_odo_url as string | null) ?? null, start_odo_reading: (b.start_odo_reading as number | null) ?? null, start_odo_at: b.start_odo_url ? now : null },
      { onConflict: 'trip_id' },
    );
    return ok(await fullTrip(tripId));
  }

  // ── POST /trips/trips/:id/complete ───────────────────────────────────────
  if (sub === 'complete' && req.method === 'POST') {
    const u = await authUser(db, req);
    const trip = await loadTrip(tripId);
    if (!trip) return fail('NOT_FOUND', 'Trip not found', 404);
    const did = u ? await driverIdFor(u.id) : null;
    if (!u || (trip.assigned_driver_id !== did && !isAdmin(u))) return fail('FORBIDDEN', '', 403);
    if (trip.status !== 'in_progress') return fail('CONFLICT', `Trip is "${trip.status}", not "in_progress"`, 409);
    const b = await readBody(req);
    const now = new Date().toISOString();
    await db.from('trips').update({ status: 'completed' }).eq('id', tripId);
    await db.from('trip_executions').upsert(
      { trip_id: tripId, completed_at: now, end_odo_url: (b.end_odo_url as string | null) ?? null, end_odo_reading: (b.end_odo_reading as number | null) ?? null, end_odo_at: b.end_odo_url ? now : null, driver_notes: (b.driver_notes as string | null) ?? null },
      { onConflict: 'trip_id' },
    );
    if (trip.assigned_driver_id) {
      const { data: d } = await db.from('drivers').select('total_trips_completed').eq('id', trip.assigned_driver_id).maybeSingle();
      if (d) await db.from('drivers').update({ total_trips_completed: (Number(d.total_trips_completed) || 0) + 1 }).eq('id', trip.assigned_driver_id);
    }
    return ok(await fullTrip(tripId));
  }

  // ── POST /trips/trips/:id/cancel ─────────────────────────────────────────
  if (sub === 'cancel' && req.method === 'POST') {
    const u = await authUser(db, req);
    const trip = await loadTrip(tripId);
    if (!trip) return fail('NOT_FOUND', 'Trip not found', 404);
    if (!u || (trip.posted_by_user_id !== u.id && !isAdmin(u))) return fail('FORBIDDEN', 'Only the trip poster can cancel', 403);
    if (trip.status === 'completed' || trip.status === 'cancelled') return fail('CONFLICT', `Trip is already "${trip.status}"`, 409);
    const b = await readBody(req);
    const now = new Date().toISOString();
    await db.from('trips').update({ status: 'cancelled', cancelled_at: now, cancel_reason_id: (b.cancel_reason_id as string | null) ?? null }).eq('id', tripId);
    await db.from('trip_acceptances').update({ status: 'rejected', decision_at: now }).eq('trip_id', tripId).in('status', ['applied', 'selected']);
    return ok(await fullTrip(tripId));
  }

  return fail('NOT_FOUND', 'No such trips route', 404);
});

serve(handler);
