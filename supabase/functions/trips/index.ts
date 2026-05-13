/**
 * /trips/* — the trip lifecycle. Public reads; authed writes (validates the caller's Bearer
 * JWT via GoTrue, then writes with the service-role client enforcing the same ownership rules
 * the RLS policies encode). Instrumented with withTiming; verify_jwt = false (we validate).
 *
 * PII / data minimisation: `GET /trips` and `GET /trips/:id` require a Bearer. Each trip is redacted
 * to the caller's relationship (`redactTrip`): the poster (and admins) see passenger name+phone, poster
 * phone, the assigned driver's live position and `distance_to_destination_km`, and the plaintext
 * passenger OTP; the *assigned* driver sees passenger name + poster phone + their own live position
 * (and passenger phone ONLY when the trip's `hide_passenger_phone` is false); everyone else (incl. an
 * applicant who hasn't been assigned yet) sees only the browse-safe fields — no passenger PII, no driver
 * positions. `passenger_otp_hash` is never returned. `GET /trips/by-otp/:otp` stays public (the OTP IS
 * the credential) — it's the passenger's own view (their data + the assigned driver's position/phone to track/reach the ride).
 *
 * Routes (at the function root, i.e. /functions/v1/trips/...):
 *   GET    /trips                       (Bearer) ?status=&from_city_id=&to_city_id=&posted_by_user_id=&assigned_driver_id=&near_lat=&near_lng=&radius_km=&limit=
 *                                       — assigned_driver_id accepts a driver uuid OR the literal `me` (the trips you're driving);
 *                                         near_lat+near_lng+radius_km restrict to trips whose pickup point (from_place → from_city fallback) is within the radius (nearest first; each row gets distance_km)
 *   POST   /trips                       (Bearer; the poster must be is_active + KYC-approved) — from_place_id / to_place_id accepted alongside from_city_id / to_city_id; hide_passenger_phone (bool) + passenger_count (int≥1) are REQUIRED; total_fare computed if omitted; driver_payout via trigger; matching active alerts get an alert_match notification
 *   GET    /trips/applied               (driver; Bearer) — the caller's own trip_acceptances, each with its joined trip ("my applications") — the joined trip is browse-safe (the caller is an applicant, not assigned)
 *   GET    /trips/by-otp/:otp           (public — the OTP is the credential) — the passenger portal; joins assigned driver+vehicle;
 *                                       fare fields nulled when show_fare_to_passenger is false; passenger_otp_hash / passenger_otp never echoed
 *   GET    /trips/:id                   (Bearer) — joined; redacted per the caller's relationship (see "PII" above)
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
import { parseNearRadius, toKm } from '../_shared/geo.ts';
import { withCache, tagCacheHit } from '../_shared/withCache.ts';
import { CacheTTL, cacheDeletePattern } from '../_shared/cache.ts';

const CACHE_EPOCH = 'v1';
// Cache RAW (unredacted) rows from the trips list query. Redaction is per-viewer and cheap;
// the SQL + joins are the expensive part. Key from the resolved filters (with `me` already
// replaced by the actual driver_id) so two callers asking for "trips assigned to me" share the
// cache when they're the same driver, and never share when they're different drivers.
function tripsListCacheKey(filters: Record<string, string | number | undefined>): string {
  const parts: string[] = [];
  for (const k of Object.keys(filters).sort()) {
    const v = filters[k];
    if (v !== undefined && v !== '') parts.push(`${k}-${v}`);
  }
  return `trips:list:${parts.join(':') || 'all'}:${CACHE_EPOCH}`;
}
function invalidateTripsList(): void {
  cacheDeletePattern('trips:list:*');
}

type Db = ReturnType<typeof serviceClient>;

// includes the assigned driver (with live position) so a trip manager can track an in-progress trip on a map; from/to place joined alongside the curated cities.
const TRIP_SELECT =
  '*, from_city:cities!from_city_id(*), to_city:cities!to_city_id(*), from_place:places!from_place_id(*), to_place:places!to_place_id(*), car_type:car_types(label), ' +
  'assigned_driver:drivers!assigned_driver_id(id, full_name, profile_photo_url, rating_avg, rating_count, total_trips_completed, current_lat, current_lng, current_location_at)';
// for the passenger portal (GET /trips/by-otp/:otp) — adds the driver's phone + the assigned vehicle.
const BY_OTP_SELECT =
  '*, from_city:cities!from_city_id(*), to_city:cities!to_city_id(*), from_place:places!from_place_id(*), to_place:places!to_place_id(*), car_type:car_types(label), ' +
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
/** For an in-progress trip with a known assigned-driver position + destination coords, the haversine km to go. */
function distanceToDest(raw: Record<string, unknown>): number | null {
  if (raw.status !== 'in_progress') return null;
  const d = raw.assigned_driver as Record<string, unknown> | null | undefined;
  const dest = raw.to_city as Record<string, unknown> | null | undefined;
  const dLat = num(d?.current_lat), dLng = num(d?.current_lng), tLat = num(dest?.lat), tLng = num(dest?.lng);
  if (dLat == null || dLng == null || tLat == null || tLng == null) return null;
  return Math.round(haversineKm(dLat, dLng, tLat, tLng) * 10) / 10;
}

// ── PII redaction ────────────────────────────────────────────────────────────
// PII / sensitive trip columns — stripped from every response by default; re-attached per viewer
// relationship in redactTrip(). IF YOU ADD A PII COLUMN TO public.trips, ADD IT TO BOTH HERE.
const TRIP_PII_COLS = ['passenger_name', 'passenger_phone', 'posted_by_phone', 'passenger_otp'] as const;
const DRIVER_POSITION_COLS = ['current_lat', 'current_lng', 'current_location_at'] as const;
type ViewerRel = 'owner' | 'admin' | 'assigned' | 'browse';

/** Who is `u` to this trip? owner (the poster) | admin | assigned (the assigned driver) | browse (anyone else). */
function relationshipFor(raw: Record<string, unknown>, u: { id: string; role: string } | null, myDriverId: string | null): ViewerRel {
  if (!u) return 'browse';
  if (u.role === 'admin') return 'admin';
  if (raw.posted_by_user_id === u.id) return 'owner';
  if (myDriverId && raw.assigned_driver_id === myDriverId) return 'assigned';
  return 'browse';
}
function withoutKeys(o: Record<string, unknown> | null | undefined, keys: readonly string[]): Record<string, unknown> | null {
  if (!o) return (o ?? null) as null;
  const c = { ...o };
  for (const k of keys) delete c[k];
  return c;
}
/**
 * Strip passenger/poster PII and the assigned driver's precise position from a raw trip row, then
 * re-attach exactly what this viewer is allowed to see:
 *   - owner / admin: everything — passenger name + phone, poster phone, driver live position,
 *     `distance_to_destination_km` (in-progress), and the plaintext `passenger_otp` (so the poster can
 *     re-open the passenger-portal link). `passenger_otp_hash` is never returned to anyone.
 *   - assigned driver: passenger name + poster phone always; passenger phone ONLY when the trip's
 *     `hide_passenger_phone` is false; their own live position + `distance_to_destination_km`. (Never
 *     the OTP — they verify what the passenger tells them.)
 *   - browse (any other authed user — incl. an applicant who isn't assigned yet): none of the above —
 *     route / fare / car type / pickup / passenger_count / applicant_count / posted_by_name / etc. only.
 */
function redactTrip(raw: Record<string, unknown>, rel: ViewerRel): Record<string, unknown> {
  const out = { ...raw };
  delete out.passenger_otp_hash;            // never anyone
  for (const k of TRIP_PII_COLS) delete out[k];
  out.assigned_driver = withoutKeys(raw.assigned_driver as Record<string, unknown> | null, DRIVER_POSITION_COLS);
  if (rel === 'owner' || rel === 'admin') {
    out.passenger_name = raw.passenger_name;
    out.passenger_phone = raw.passenger_phone;
    out.posted_by_phone = raw.posted_by_phone;
    out.assigned_driver = (raw.assigned_driver as Record<string, unknown> | null) ?? null;
    if (typeof raw.passenger_otp === 'string' && raw.passenger_otp) out.passenger_otp = raw.passenger_otp;
    const dist = distanceToDest(raw);
    if (dist != null) out.distance_to_destination_km = dist;
  } else if (rel === 'assigned') {
    out.passenger_name = raw.passenger_name;
    out.posted_by_phone = raw.posted_by_phone;
    if (!raw.hide_passenger_phone) out.passenger_phone = raw.passenger_phone;
    out.assigned_driver = (raw.assigned_driver as Record<string, unknown> | null) ?? null; // their own position
    const dist = distanceToDest(raw);
    if (dist != null) out.distance_to_destination_km = dist;
  }
  return out;
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
  /** Re-fetch a trip joined + redacted for the viewer `u` (used by POST/assign/start/complete/cancel). */
  async function fullTrip(id: string, u: { id: string; role: string }): Promise<Record<string, unknown>> {
    const { data, error } = await db.from('trips').select(TRIP_SELECT).eq('id', id).single();
    if (error) throw new Error(error.message);
    const raw = data as Record<string, unknown>;
    const myDriverId = (u.role !== 'admin' && raw.posted_by_user_id !== u.id && raw.assigned_driver_id) ? await driverIdFor(u.id) : null;
    return redactTrip(raw, relationshipFor(raw, u, myDriverId));
  }

  // ── GET /trips (list) — Bearer required ──────────────────────────────────
  // PII strategy: cache the RAW (unredacted) rows keyed by the resolved filters; run
  // `redactTrip` per-viewer AFTER the cache fetch (microseconds — much cheaper than the SQL).
  // `assigned_driver_id=me` is resolved to the caller's driver_id and included in the key,
  // so two different drivers asking for "trips assigned to me" don't share a cache entry.
  if (!tripId && req.method === 'GET') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', 'Sign in to browse trips', 401);
    const status = url.searchParams.get('status') ?? '';
    const fromCity = url.searchParams.get('from_city_id') ?? '';
    const toCity = url.searchParams.get('to_city_id') ?? '';
    const postedBy = url.searchParams.get('posted_by_user_id') ?? '';
    const assignedDriverRaw = url.searchParams.get('assigned_driver_id') ?? '';
    let assignedDriver = assignedDriverRaw;
    if (assignedDriverRaw === 'me') {
      const did = await driverIdFor(u.id);
      if (!did) return ok([]); // no driver profile ⇒ nothing assigned to you
      assignedDriver = did;
    }
    const near = parseNearRadius(url);
    const limit = Math.min(Number.isFinite(Number(url.searchParams.get('limit'))) ? Number(url.searchParams.get('limit')) : 50, 100);

    // Cache eligibility — skip when status would touch live-tracked trips: 'in_progress' includes
    // the driver's live position in the row, which a 30s cache would stale. Open / has_applicants
    // / assigned / completed / cancelled are safe; mixed lists (no status) we also skip out of
    // caution. Per-trip detail caching is a Phase-4 follow-up.
    const statusArr = status ? status.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const cacheable = statusArr.length > 0 && !statusArr.includes('in_progress');
    interface CachedShape {
      rows: Record<string, unknown>[];
      distEntries: [string, number][] | null;
    }
    const fetcher = async (): Promise<CachedShape> => {
      let q = db.from('trips').select(TRIP_SELECT);
      if (status) {
        if (statusArr.length === 1) q = q.eq('status', statusArr[0]);
        else if (statusArr.length > 1) q = q.in('status', statusArr);
      }
      if (fromCity) q = q.eq('from_city_id', fromCity);
      if (toCity) q = q.eq('to_city_id', toCity);
      if (postedBy) q = q.eq('posted_by_user_id', postedBy);
      if (assignedDriver) q = q.eq('assigned_driver_id', assignedDriver);
      let distEntries: [string, number][] | null = null;
      if (near) {
        const { data: rad, error: radErr } = await db.rpc('trips_in_radius', { p_lat: near.lat, p_lng: near.lng, p_radius_m: near.radiusM });
        if (radErr) throw new Error(radErr.message);
        const list = (rad ?? []) as { id: string; distance_m: number }[];
        if (list.length === 0) return { rows: [], distEntries: [] };
        distEntries = list.map((r) => [r.id, toKm(Number(r.distance_m))]);
        q = q.in('id', list.map((r) => r.id));
      }
      q = q.limit(limit);
      if (!near) q = q.order('pickup_at', { ascending: true });
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as Record<string, unknown>[], distEntries };
    };

    let payload: CachedShape;
    let hit: 'memory' | 'shared' | 'miss';
    if (cacheable) {
      const result = await withCache<CachedShape>(
        {
          key: tripsListCacheKey({
            status,
            from_city_id: fromCity,
            to_city_id: toCity,
            posted_by_user_id: postedBy,
            assigned_driver_id: assignedDriver,
            near_lat: near ? near.lat.toFixed(3) : '',
            near_lng: near ? near.lng.toFixed(3) : '',
            radius_m: near ? near.radiusM : '',
            limit,
          }),
          ttl: CacheTTL.SHORT,
          tier: 'memory',
        },
        fetcher,
      );
      payload = result.data;
      hit = result.hit;
    } else {
      payload = await fetcher();
      hit = 'miss';
    }
    const rawRows = payload.rows;
    const distById = payload.distEntries ? new Map(payload.distEntries) : null;
    const myDriverId = (u.role !== 'admin' && rawRows.some((r) => r.assigned_driver_id && r.posted_by_user_id !== u.id)) ? await driverIdFor(u.id) : null;
    let rows = rawRows.map((r) => redactTrip(r, relationshipFor(r, u, myDriverId)));
    if (distById) {
      rows = rows.map((r) => ({ ...r, distance_km: distById.get(r.id as string) ?? null }))
                 .sort((a, b) => ((a.distance_km as number) ?? Infinity) - ((b.distance_km as number) ?? Infinity));
    }
    return tagCacheHit(ok(rows), hit);
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
    const hidePassengerPhone = typeof b.hide_passenger_phone === 'boolean' ? b.hide_passenger_phone : true;
    const passengerCount = Number(b.passenger_count);
    if (!Number.isInteger(passengerCount) || passengerCount < 1) {
      return fail('VALIDATION', 'passenger_count (a positive integer) is required', 422);
    }
    const totalFare = b.total_fare !== undefined && b.total_fare !== null ? Number(b.total_fare) : Math.round(distance * rate);
    const { data: usr } = await db.from('users').select('display_name, role').eq('id', u.id).maybeSingle();
    const posterRole = usr?.role === 'driver' ? 'driver' : 'trip_manager';
    const { data: posterProf } = await (posterRole === 'driver'
      ? db.from('drivers').select('kyc_status, is_active').eq('user_id', u.id).maybeSingle()
      : db.from('trip_managers').select('kyc_status, is_active').eq('user_id', u.id).maybeSingle());
    if (posterProf?.is_active === false) return fail('ACCOUNT_SUSPENDED', 'Your account has been deactivated — contact support.', 403);
    if ((posterProf?.kyc_status as string) !== 'approved') return fail('KYC_REQUIRED', 'Complete your verification (KYC) before posting a trip', 403);
    const insert = {
      posted_by_user_id: u.id,
      posted_by_role: posterRole,
      posted_by_name: (usr?.display_name as string) ?? '',
      posted_by_phone: (b.posted_by_phone as string | null) ?? null,
      from_city_id: fromCityId,
      to_city_id: toCityId,
      from_place_id: (typeof b.from_place_id === 'string' && b.from_place_id) ? b.from_place_id : null,
      to_place_id: (typeof b.to_place_id === 'string' && b.to_place_id) ? b.to_place_id : null,
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
      passenger_name: (typeof b.passenger_name === 'string' && b.passenger_name.trim()) ? b.passenger_name.trim() : '',
      passenger_phone: (typeof b.passenger_phone === 'string' && b.passenger_phone.trim()) ? b.passenger_phone.trim() : '',
      passenger_count: passengerCount,
      luggage_notes: (b.luggage_notes as string | null) ?? null,
      special_requests: (b.special_requests as string | null) ?? null,
      show_fare_to_passenger: b.show_fare_to_passenger ?? true,
      hide_passenger_phone: hidePassengerPhone,
      status: 'open',
    };
    const { data: created, error } = await db.from('trips').insert(insert).select('id').single();
    if (error) return pgFail(error); // 23503 (bad from_place_id/to_place_id/from_city_id/…) → 422
    // fire alert_match notifications for matching active alerts (best-effort; never fails the POST).
    try { await db.rpc('match_alerts_for_trip', { p_trip_id: created.id }); } catch { /* ignore */ }
    // upsert into the passengers directory — first poster wins (name + referrer never overwritten);
    // a different name on a later trip is appended to `aliases`. Best-effort; never fails the POST.
    const passengerPhone = (insert as Record<string, unknown>).passenger_phone as string;
    const passengerName = (insert as Record<string, unknown>).passenger_name as string;
    if (passengerPhone && passengerName) {
      try { await db.rpc('upsert_passenger_from_trip', {
        p_phone: passengerPhone,
        p_name: passengerName,
        p_referred_by_user_id: u.id,
        p_trip_id: created.id,
      }); } catch { /* ignore */ }
    }
    invalidateTripsList();
    return ok(await fullTrip(created.id as string, u));
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
    // The passenger's own view: their data + the assigned driver (with live position + phone, to track/reach the ride).
    delete row.passenger_otp_hash;
    delete row.passenger_otp; // the OTP is already in the URL — no need to echo the stored copy
    const dist = distanceToDest(row);
    if (dist != null) row.distance_to_destination_km = dist;
    if (!row.show_fare_to_passenger) {
      for (const k of ['total_fare', 'rate_per_km', 'driver_payout', 'commission_pct', 'gst_amount', 'driver_bata']) row[k] = null;
    }
    return ok(row);
  }

  // ── GET /trips/applied (the caller's own applications — driver-scoped) ────
  if (tripId === 'applied' && !sub && req.method === 'GET') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', 'Sign in to see your applications', 401);
    const did = await driverIdFor(u.id);
    if (!did) return ok([]); // no driver profile ⇒ no applications
    const { data, error } = await db
      .from('trip_acceptances')
      .select('*, trip:trips!trip_id(*, from_city:cities!from_city_id(*), to_city:cities!to_city_id(*), car_type:car_types(label))')
      .eq('driver_id', did)
      .order('applied_at', { ascending: false });
    if (error) return fail('DB_ERROR', error.message, 500);
    const rows = (data ?? []).map((r) => {
      const rec = r as Record<string, unknown>;
      const t = rec.trip as Record<string, unknown> | null;
      // the caller is an applicant (not yet assigned) on these trips ⇒ browse-safe trip detail (no PII)
      if (t) { delete t.passenger_otp_hash; delete t.passenger_otp; for (const k of TRIP_PII_COLS) delete t[k]; }
      return rec;
    });
    return ok(rows);
  }

  // ── GET /trips/:id — Bearer required ─────────────────────────────────────
  if (!sub && req.method === 'GET') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', 'Sign in to view a trip', 401);
    const { data, error } = await db.from('trips').select(TRIP_SELECT).eq('id', tripId).maybeSingle();
    if (error) return fail('DB_ERROR', error.message, 500);
    if (!data) return fail('NOT_FOUND', 'Trip not found', 404);
    const raw = data as Record<string, unknown>;
    const myDriverId = (u.role !== 'admin' && raw.posted_by_user_id !== u.id && raw.assigned_driver_id) ? await driverIdFor(u.id) : null;
    return ok(redactTrip(raw, relationshipFor(raw, u, myDriverId)));
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
      const { data: drv } = await db.from('drivers').select('kyc_status, is_active').eq('id', did).maybeSingle();
      if (drv?.is_active === false) return fail('ACCOUNT_SUSPENDED', 'Your driver account has been deactivated — contact support.', 403);
      if ((drv?.kyc_status as string) !== 'approved') return fail('KYC_REQUIRED', 'Complete your verification (KYC) before applying to trips', 403);
      const b = await readBody(req);
      const { data, error } = await db
        .from('trip_acceptances')
        .insert({ trip_id: tripId, driver_id: did, vehicle_id: (b.vehicle_id as string | null) ?? null, applicant_quoted_rate_per_km: (b.applicant_quoted_rate_per_km as number | null) ?? null, applicant_message: (b.applicant_message as string | null) ?? null, status: 'applied' })
        .select('id')
        .single();
      if (error) return error.code === '23505' ? fail('CONFLICT', 'You already applied to this trip', 409) : pgFail(error);
      await db.from('trips').update({ status: 'has_applicants' }).eq('id', tripId).eq('status', 'open');
      const { data: full } = await db.from('trip_acceptances').select(ACCEPTANCE_SELECT).eq('id', data.id as string).single();
      invalidateTripsList();
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
      invalidateTripsList();
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
      invalidateTripsList();
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
    const { data: chosenDrv } = await db.from('drivers').select('is_active').eq('id', acc.driver_id).maybeSingle();
    if (chosenDrv?.is_active === false) return fail('VALIDATION', 'That driver has been deactivated — pick another applicant', 422);
    const now = new Date().toISOString();
    const otp = genOtp();
    const otpHash = await sha256hex(otp);
    await db.from('trip_acceptances').update({ status: 'rejected', decision_at: now }).eq('trip_id', tripId).neq('id', aid).in('status', ['applied', 'selected']);
    await db.from('trip_acceptances').update({ status: 'selected', decision_at: now }).eq('id', aid);
    const { error } = await db
      .from('trips')
      .update({ status: 'assigned', assigned_driver_id: acc.driver_id, assigned_vehicle_id: (acc.vehicle_id as string | null) ?? null, assigned_acceptance_id: aid, assigned_at: now, passenger_otp_hash: otpHash, passenger_otp: otp })
      .eq('id', tripId);
    if (error) return pgFail(error);
    await db.from('trip_executions').upsert({ trip_id: tripId }, { onConflict: 'trip_id', ignoreDuplicates: true });
    const t = await fullTrip(tripId, u!);
    invalidateTripsList();
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
    invalidateTripsList();
    return ok(await fullTrip(tripId, u!));
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
    invalidateTripsList();
    return ok(await fullTrip(tripId, u!));
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
    invalidateTripsList();
    return ok(await fullTrip(tripId, u!));
  }

  // ── PATCH /trips/:id — update passenger details (poster/admin; blocked once in_progress) ──
  if (!sub && req.method === 'PATCH') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', 'Sign in to update a trip', 401);
    const trip = await loadTrip(tripId);
    if (!trip) return fail('NOT_FOUND', 'Trip not found', 404);
    if (trip.posted_by_user_id !== u.id && !isAdmin(u)) return fail('FORBIDDEN', 'Only the trip poster can update passenger details', 403);
    const blockingStatuses = ['in_progress', 'completed', 'cancelled'];
    if (blockingStatuses.includes(trip.status)) return fail('CONFLICT', 'Trip has started — passenger details can no longer be changed', 422);
    const b = await readBody(req);
    const patch: Record<string, unknown> = {};
    if ('passenger_name' in b) patch.passenger_name = (typeof b.passenger_name === 'string' && b.passenger_name.trim()) ? b.passenger_name.trim() : '';
    if ('passenger_phone' in b) patch.passenger_phone = (typeof b.passenger_phone === 'string' && b.passenger_phone.trim()) ? b.passenger_phone.trim() : '';
    if ('passenger_count' in b) {
      const pc = Number(b.passenger_count);
      if (!Number.isInteger(pc) || pc < 1) return fail('VALIDATION', 'passenger_count must be a positive integer', 422);
      patch.passenger_count = pc;
    }
    if ('luggage_notes' in b) patch.luggage_notes = (b.luggage_notes as string | null) ?? null;
    if ('special_requests' in b) patch.special_requests = (b.special_requests as string | null) ?? null;
    if ('hide_passenger_phone' in b && typeof b.hide_passenger_phone === 'boolean') patch.hide_passenger_phone = b.hide_passenger_phone;
    if (Object.keys(patch).length === 0) return ok(await fullTrip(tripId, u));
    const { error } = await db.from('trips').update(patch).eq('id', tripId);
    if (error) return pgFail(error);
    return ok(await fullTrip(tripId, u));
  }

  return fail('NOT_FOUND', 'No such trips route', 404);
});

serve(handler);
