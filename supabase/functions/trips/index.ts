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
 *   GET    /trips                       (Bearer) ?status=&from_city_id=&to_city_id=&via_city_id=&posted_by_user_id=&assigned_driver_id=&near_lat=&near_lng=&radius_km=&limit=
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
import { sharedCacheInvalidateEntity } from '../_shared/sharedCache.ts';
import { setCacheControl } from '../_shared/httpCache.ts';
import { stripPhones, assertNoPhones, PhoneInTextError, revealCache, logPiiReveal } from '../_shared/pii.ts';
import { authUser, isAdmin } from '../_shared/auth.ts';
import { readBody, pgFail } from '../_shared/http.ts';

// v3 (2026-05-14): added `posted_by_kyc_status` to every trip row (drives <VerifiedBadge>).
// v4 (2026-05-15): added `pending_invitation_count` to every trip row (drives the "Invited" chip on /posted-trips).
// v6 (2026-05-15): on `?invited=me` rows, stamp `invitation_id` + `invitation_status`; narrow
//   the driver's Invited tab to status ∈ ('pending','applied') so a declined invite drops out
//   of the queue immediately (the agent still sees it as 'declined' on `/trips/:id/invitations`).
// v5 (2026-05-15): promoted list cache from `tier:'memory'` to `tier:'shared'` (api_metrics
//   showed a 0.04% hit rate for trips on the per-isolate memory tier — Deno Deploy churns
//   isolates fast enough that warmed memory is almost never reused). Shared tier costs one
//   extra round-trip to `api_cache` on a miss but lets warm caches survive across isolates.
//   Mutations invalidate by entityKind='trip' / entityId='list'. Bump on response-shape changes.
// v7 (2026-05-16): bumped after QA-data reset wipe.
const CACHE_EPOCH = 'v7';
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
async function invalidateTripsList(): Promise<void> {
  cacheDeletePattern('trips:list:*');
  await sharedCacheInvalidateEntity('trip', 'list');
}

type Db = ReturnType<typeof serviceClient>;

// includes the assigned driver (with live position) so a trip manager can track an in-progress trip on a map; from/to place joined alongside the curated cities;
// waypoints (migration 024) joined as an ordered list so the client can render the route chain (one_way / round_trip / multi_way).
const WAYPOINTS_JOIN = 'waypoints:trip_waypoints!trip_id(id, seq, city:cities!city_id(*), place:places!place_id(*), arrive_at, wait_minutes, is_destination, notes)';
const TRIP_SELECT =
  '*, posted_by_user:users!posted_by_user_id(display_handle), from_city:cities!from_city_id(*), to_city:cities!to_city_id(*), from_place:places!from_place_id(*), to_place:places!to_place_id(*), car_type:car_types(label), ' + WAYPOINTS_JOIN + ', ' +
  'assigned_driver:drivers!assigned_driver_id(id, user_id, full_name, phone, profile_photo_url, kyc_status, rating_avg, rating_count, total_trips_completed, current_lat, current_lng, current_location_at, user:users!user_id(display_handle))';
// for the passenger portal (GET /trips/by-otp/:otp) — adds the driver's phone + the assigned vehicle.
const BY_OTP_SELECT =
  '*, posted_by_user:users!posted_by_user_id(display_handle), from_city:cities!from_city_id(*), to_city:cities!to_city_id(*), from_place:places!from_place_id(*), to_place:places!to_place_id(*), car_type:car_types(label), ' + WAYPOINTS_JOIN + ', ' +
  'assigned_driver:drivers!assigned_driver_id(id, user_id, full_name, phone, profile_photo_url, rating_avg, rating_count, total_trips_completed, current_lat, current_lng, current_location_at, user:users!user_id(display_handle)), ' +
  'assigned_vehicle:vehicles!assigned_vehicle_id(id, year, seats, ac, make:vehicle_makes(name), model:vehicle_models(name), car_type:car_types(label))';
const ACCEPTANCE_SELECT =
  '*, driver:drivers(id, user_id, full_name, phone, email, profile_photo_url, rating_avg, rating_count, total_trips_completed, top_tags, user:users!user_id(display_handle), current_city:cities!current_city_id(*)), ' +
  'vehicle:vehicles(id, year, seats, ac, make:vehicle_makes(name), model:vehicle_models(name), car_type:car_types(label))';

async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Reconcile the driver's vacancies when their accepted trip moves through the lifecycle (migration 039).
 *
 *   'accept'  → flip any active vacancy whose [available_from, available_until] covers the trip's
 *               pickup_at into 'on_trip' + linked_trip_id (hidden from agent search; banner shows
 *               on the driver's own IAmAvailableCard).
 *   'start'   → trip went in_progress; the slot is now consumed → vacancy 'expired'.
 *   'revert'  → trip was cancelled or the agent unselected the accepted driver → put the vacancy
 *               back to 'active' if its window is still in the future, else 'expired'.
 *
 * All paths are best-effort: a vacancy reconcile failure must not 500 the trip mutation.
 */
async function syncVacanciesForTrip(
  db: Db,
  action: 'accept' | 'start' | 'revert',
  tripId: string,
  opts: { driverId?: string | null; pickupAt?: string | null; expectedEndAt?: string | null } = {},
): Promise<void> {
  try {
    if (action === 'accept') {
      if (!opts.driverId || !opts.pickupAt) return;
      // Full-interval overlap: vacancy must cover the trip's [pickup_at, expected_end_at].
      // Falls back to pickup_at if expectedEndAt is missing (defensive — trips.expected_end_at
      // has been NOT NULL since migration 024).
      const endIso = opts.expectedEndAt ?? opts.pickupAt;
      await db
        .from('vacancies')
        .update({ status: 'on_trip', linked_trip_id: tripId, updated_at: new Date().toISOString() })
        .eq('driver_id', opts.driverId)
        .eq('status', 'active')
        .lte('available_from', opts.pickupAt)
        .or(`available_until.is.null,available_until.gte.${endIso}`);
      return;
    }
    if (action === 'start') {
      await db
        .from('vacancies')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('linked_trip_id', tripId)
        .eq('status', 'on_trip');
      return;
    }
    // 'revert' — trip cancelled or driver unselected after accepting.
    const nowIso = new Date().toISOString();
    // window still in the future → back to 'active'
    await db
      .from('vacancies')
      .update({ status: 'active', linked_trip_id: null, updated_at: nowIso })
      .eq('linked_trip_id', tripId)
      .eq('status', 'on_trip')
      .or(`available_until.is.null,available_until.gt.${nowIso}`);
    // anything left is past-window → expire it (still drop the link)
    await db
      .from('vacancies')
      .update({ status: 'expired', linked_trip_id: null, updated_at: nowIso })
      .eq('linked_trip_id', tripId)
      .eq('status', 'on_trip');
  } catch (e) {
    // Side-effect: do not fail the parent request. withTiming will surface to Sentry if needed.
    console.error('syncVacanciesForTrip failed', { action, tripId, error: (e as Error)?.message });
  }
}

// ── waypoint plan (migration 024) ────────────────────────────────────────────
type TripType = 'one_way' | 'round_trip' | 'multi_way';
type WaypointInsert = {
  trip_id?: string;       // set after the parent trips row is inserted
  seq: number;
  city_id: string | null;
  place_id: string | null;
  arrive_at: string | null;
  wait_minutes: number;
  is_destination: boolean;
  notes: string | null;
};
type WaypointPlan = {
  trip_type: TripType;
  expected_end_at: string;          // ISO; > pickup_at and ≤ pickup_at + max_trip_duration_days
  waypoints: WaypointInsert[];      // ≥ 2, with seq=0..N
  from_city_id: string;             // denormalised first waypoint
  from_place_id: string | null;
  to_city_id: string;               // denormalised last waypoint
  to_place_id: string | null;
};

/** Parse + validate the waypoint shape from a POST body. Returns a Response on failure. */
async function buildWaypointPlan(db: Db, body: Record<string, unknown>, pickupAtIso: string): Promise<WaypointPlan | Response> {
  const tripType = (typeof body.trip_type === 'string' && ['one_way', 'round_trip', 'multi_way'].includes(body.trip_type) ? body.trip_type : 'one_way') as TripType;

  // Either accept `waypoints[]` directly, or synthesise from legacy from_*/to_* (one_way only).
  let raw: Record<string, unknown>[];
  if (Array.isArray(body.waypoints) && body.waypoints.length > 0) {
    raw = (body.waypoints as unknown[]).map((w) => (w && typeof w === 'object' ? (w as Record<string, unknown>) : {}));
  } else {
    const fromCity = typeof body.from_city_id === 'string' ? body.from_city_id : '';
    const toCity = typeof body.to_city_id === 'string' ? body.to_city_id : '';
    if (!fromCity || !toCity) return fail('VALIDATION', 'either waypoints[] or both from_city_id and to_city_id are required', 422);
    raw = [
      { city_id: fromCity, place_id: typeof body.from_place_id === 'string' ? body.from_place_id : null, wait_minutes: 0, is_destination: false },
      { city_id: toCity, place_id: typeof body.to_place_id === 'string' ? body.to_place_id : null, arrive_at: null, wait_minutes: 0, is_destination: true },
    ];
  }

  if (raw.length < 2) return fail('VALIDATION', 'a trip needs at least 2 waypoints (origin + destination)', 422);

  // shape per trip_type
  const firstCity = (raw[0]?.city_id as string | null | undefined) ?? null;
  const firstPlace = (raw[0]?.place_id as string | null | undefined) ?? null;
  const lastCity = (raw[raw.length - 1]?.city_id as string | null | undefined) ?? null;
  const lastPlace = (raw[raw.length - 1]?.place_id as string | null | undefined) ?? null;
  if (!firstCity && !firstPlace) return fail('VALIDATION', 'first waypoint needs city_id or place_id', 422);
  if (!lastCity && !lastPlace) return fail('VALIDATION', 'last waypoint needs city_id or place_id', 422);

  const sameEndpoints = (firstCity && lastCity && firstCity === lastCity) || (firstPlace && lastPlace && firstPlace === lastPlace);
  if (tripType === 'round_trip' && !sameEndpoints) return fail('VALIDATION', 'round_trip requires the last waypoint to match the first city/place', 422);
  if (tripType === 'multi_way' && raw.length < 3) return fail('VALIDATION', 'multi_way requires ≥3 waypoints', 422);
  // multi_way may loop back (last == first) — the client distinguishes "drop" vs "return back" for share text.
  if (tripType === 'one_way' && sameEndpoints) return fail('VALIDATION', 'one_way last waypoint must differ from the first (use round_trip for a loop)', 422);

  // monotonic arrive_at; phones scrubbed; defaults applied
  const pickupMs = new Date(pickupAtIso).getTime();
  if (!Number.isFinite(pickupMs)) return fail('VALIDATION', 'pickup_at is not a valid ISO timestamp', 422);
  let prevMs = pickupMs;
  const waypoints: WaypointInsert[] = [];
  for (let i = 0; i < raw.length; i++) {
    const w = raw[i];
    const city = typeof w.city_id === 'string' && w.city_id ? w.city_id : null;
    const place = typeof w.place_id === 'string' && w.place_id ? w.place_id : null;
    if (!city && !place) return fail('VALIDATION', `waypoint ${i}: city_id or place_id required`, 422);
    let arriveAt: string | null = null;
    if (i > 0) {
      // intermediate + final must carry a monotonic arrive_at
      const a = typeof w.arrive_at === 'string' ? w.arrive_at : null;
      if (a) {
        const ms = new Date(a).getTime();
        if (!Number.isFinite(ms)) return fail('VALIDATION', `waypoint ${i}: arrive_at must be ISO`, 422);
        if (ms <= prevMs) return fail('VALIDATION', `waypoint ${i}: arrive_at must be after the previous waypoint's time`, 422);
        prevMs = ms;
        arriveAt = a;
      }
      // arrive_at is optional for intermediate AND final waypoints — when the final's is null,
      // expected_end_at falls back to pickup_at + 1 day (or the body-supplied expected_end_at).
    }
    const notes = typeof w.notes === 'string' ? w.notes : null;
    try { assertNoPhones(notes, `waypoints[${i}].notes`); } catch (e) {
      if (e instanceof PhoneInTextError) return fail('VALIDATION', e.message, 400);
      throw e;
    }
    const wait = Number.isFinite(Number(w.wait_minutes)) ? Math.max(0, Math.floor(Number(w.wait_minutes))) : 0;
    waypoints.push({
      seq: i,
      city_id: city,
      place_id: place,
      arrive_at: arriveAt,
      wait_minutes: wait,
      is_destination: typeof w.is_destination === 'boolean' ? w.is_destination : i === raw.length - 1,
      notes,
    });
  }

  // expected_end_at: body value > computed-from-last-waypoint > pickup_at + 1d
  const lastWp = waypoints[waypoints.length - 1];
  const computedEndMs = lastWp.arrive_at ? new Date(lastWp.arrive_at).getTime() + lastWp.wait_minutes * 60_000 : pickupMs + 86_400_000;
  const bodyEnd = typeof body.expected_end_at === 'string' ? body.expected_end_at : null;
  const endIso = bodyEnd ?? new Date(computedEndMs).toISOString();
  const endMs = new Date(endIso).getTime();
  if (!Number.isFinite(endMs) || endMs <= pickupMs) return fail('VALIDATION', 'expected_end_at must be after pickup_at', 422);

  // span ≤ max_trip_duration_days
  const { data: settings } = await db.from('app_settings').select('max_trip_duration_days').eq('id', 1).maybeSingle();
  const maxDays = Number((settings as Record<string, unknown> | null)?.max_trip_duration_days ?? 14);
  if ((endMs - pickupMs) > maxDays * 86_400_000) return fail('VALIDATION', `trip span exceeds the ${maxDays}-day cap`, 422);

  return {
    trip_type: tripType,
    expected_end_at: endIso,
    waypoints,
    from_city_id: firstCity ?? '',
    from_place_id: firstPlace,
    to_city_id: lastCity ?? '',
    to_place_id: lastPlace,
  };
}

/** Sort the joined waypoints by seq (PostgREST embed doesn't guarantee order). */
function sortWaypoints(row: Record<string, unknown> | null | undefined): void {
  if (!row) return;
  const wp = row.waypoints as Record<string, unknown>[] | undefined;
  if (Array.isArray(wp)) wp.sort((a, b) => Number(a.seq) - Number(b.seq));
}
const genOtp = () => String(Math.floor(100000 + Math.random() * 900000));
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

// ── Counterparty verification checklist (GET /trips/:id only) ────────────────
// After assignment, the poster wants confidence in their driver, and the assigned driver
// wants confidence in the poster. We mirror the per-step "Get verified" checklist (the
// same shape /drivers/me and /agents/me return) so the trip-detail UI can show a tick
// list — without exposing the actual document URLs (just done/todo/action_needed).
const REQUIRED_VEHICLE_PHOTO_COLS = [
  'photo_front_url', 'photo_back_url', 'photo_left_url', 'photo_right_url', 'photo_plate_url', 'rc_book_url', 'insurance_url',
] as const;
type VerificationBlock = {
  kyc_status: string;
  steps: Record<string, string>;
  steps_done: number;
  steps_total: number;
};
async function buildDriverVerificationLite(db: Db, driverId: string): Promise<VerificationBlock | null> {
  const { data } = await db.from('drivers')
    .select('id, kyc_status, full_name, home_city_id, aadhaar_front_path, aadhaar_back_path, driver_license_path, selfie_path')
    .eq('id', driverId).maybeSingle();
  if (!data) return null;
  const drv = data as Record<string, unknown>;
  const kycStatus = (drv.kyc_status as string) || 'pending';
  const hasAllDocs = !!(drv.aadhaar_front_path && drv.aadhaar_back_path && drv.driver_license_path && drv.selfie_path);
  const documents = kycStatus === 'resubmit_required' ? 'action_needed' : hasAllDocs ? 'done' : 'todo';
  const { data: vehs } = await db.from('vehicles').select('*').eq('driver_id', driverId).eq('is_active', true);
  const vehicles = (vehs ?? []) as Record<string, unknown>[];
  const chosen = vehicles.find((v) => v.is_primary) ?? vehicles[0] ?? null;
  const vehiclePhotosDone = !!chosen && REQUIRED_VEHICLE_PHOTO_COLS.every((c) => typeof chosen[c] === 'string' && (chosen[c] as string).length > 0);
  const { data: vvRows } = await db.from('video_verifications')
    .select('status, outcome').eq('driver_id', driverId).order('created_at', { ascending: false }).limit(1);
  const vv = (vvRows && vvRows[0]) ? (vvRows[0] as Record<string, unknown>) : null;
  const videoCall = kycStatus === 'approved' || kycStatus === 'ready_for_approval' ? 'done'
    : vv && vv.status === 'scheduled' ? 'scheduled'
    : vv && vv.status === 'completed' && vv.outcome === 'approved' ? 'done'
    : 'todo';
  const details = drv.full_name && drv.home_city_id ? 'done' : 'todo';
  const steps = { details, documents, vehicle: vehicles.length > 0 ? 'done' : 'todo', vehicle_photos: vehiclePhotosDone ? 'done' : 'todo', video_call: videoCall } as Record<string, string>;
  return { kyc_status: kycStatus, steps, steps_done: Object.values(steps).filter((s) => s === 'done').length, steps_total: 5 };
}
async function buildAgentVerificationLite(db: Db, managerId: string): Promise<VerificationBlock | null> {
  const { data } = await db.from('trip_managers')
    .select('id, kyc_status, full_name, business_city_id, aadhaar_front_path, aadhaar_back_path, selfie_path')
    .eq('id', managerId).maybeSingle();
  if (!data) return null;
  const tm = data as Record<string, unknown>;
  const kycStatus = (tm.kyc_status as string) || 'pending';
  const hasAllDocs = !!(tm.aadhaar_front_path && tm.aadhaar_back_path && tm.selfie_path);
  const documents = kycStatus === 'resubmit_required' ? 'action_needed' : hasAllDocs ? 'done' : 'todo';
  const { data: vvRows } = await db.from('video_verifications')
    .select('status, outcome').eq('manager_id', managerId).order('created_at', { ascending: false }).limit(1);
  const vv = (vvRows && vvRows[0]) ? (vvRows[0] as Record<string, unknown>) : null;
  const videoCall = kycStatus === 'approved' || kycStatus === 'ready_for_approval' ? 'done'
    : vv && vv.status === 'scheduled' ? 'scheduled'
    : vv && vv.status === 'completed' && vv.outcome === 'approved' ? 'done'
    : 'todo';
  const details = tm.full_name && tm.business_city_id ? 'done' : 'todo';
  const steps = { details, documents, video_call: videoCall } as Record<string, string>;
  return { kyc_status: kycStatus, steps, steps_done: Object.values(steps).filter((s) => s === 'done').length, steps_total: 3 };
}
async function agentIdForUser(db: Db, userId: string): Promise<string | null> {
  const { data } = await db.from('trip_managers').select('id').eq('user_id', userId).maybeSingle();
  return ((data as Record<string, unknown> | null)?.id as string | undefined) ?? null;
}

// ── PII redaction ────────────────────────────────────────────────────────────
// PII / sensitive trip columns — stripped from every response by default; re-attached per viewer
// relationship in redactTrip(). IF YOU ADD A PII COLUMN TO public.trips, ADD IT TO BOTH HERE.
const TRIP_PII_COLS = ['passenger_name', 'passenger_phone', 'posted_by_name', 'posted_by_phone', 'passenger_otp'] as const;
const DRIVER_POSITION_COLS = ['current_lat', 'current_lng', 'current_location_at'] as const;
const DRIVER_PII_COLS = ['full_name', 'phone', 'email', 'profile_photo_url'] as const;
const TRIP_TEXT_FIELDS = ['driver_instructions', 'luggage_notes', 'special_requests'] as const;
type ViewerRel = 'owner' | 'admin' | 'accepted' | 'selected' | 'browse';

/** Who is `u` to this trip?
 *   owner    — the poster (or an admin)
 *   admin    — site admin
 *   selected — the driver the agent just picked, before they Accept (status='selected'). Mutual reveal
 *              (agent name+phone) so they can call to confirm; passenger details still hidden.
 *   assigned — the driver, after they've Accepted (status='accepted' or later). Full reveal.
 *   browse   — everyone else.
 */
function relationshipFor(raw: Record<string, unknown>, u: { id: string; role: string } | null, myDriverId: string | null): ViewerRel {
  if (!u) return 'browse';
  if (u.role === 'admin') return 'admin';
  if (raw.posted_by_user_id === u.id) return 'owner';
  if (myDriverId && raw.assigned_driver_id === myDriverId) {
    return raw.status === 'selected' ? 'selected' : 'accepted';
  }
  return 'browse';
}
/** Flatten `driver.user.display_handle` onto the joined driver row + scrub free-text on acceptances. */
function shapeAcceptance(row: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!row) return row ?? null;
  const out = { ...row };
  const drv = out.driver as Record<string, unknown> | null | undefined;
  if (drv) {
    const flat = { ...drv };
    const u = flat.user as Record<string, unknown> | null | undefined;
    flat.display_handle = u && typeof u.display_handle === 'string' ? u.display_handle : null;
    delete flat.user;
    out.driver = flat;
  }
  if (typeof out.applicant_message === 'string') out.applicant_message = stripPhones(out.applicant_message);
  if (typeof out.decision_note === 'string') out.decision_note = stripPhones(out.decision_note);
  // if a trip is joined into the acceptance (e.g. GET /trips/applied), scrub its text fields too
  const t = out.trip as Record<string, unknown> | null | undefined;
  if (t) {
    const tt = { ...t } as Record<string, unknown>;
    scrubTripText(tt);
    out.trip = tt;
  }
  return out;
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
/** Flatten the joined assigned_driver row: lift display_handle off the nested `user`, return both the
 *  shaped driver and the handle. */
function shapeAssignedDriver(raw: Record<string, unknown> | null | undefined): { driver: Record<string, unknown> | null; handle: string | null } {
  if (!raw) return { driver: null, handle: null };
  const drv: Record<string, unknown> = { ...raw };
  const du = drv.user as Record<string, unknown> | null | undefined;
  const handle = du && typeof du.display_handle === 'string' ? du.display_handle : null;
  drv.display_handle = handle;
  delete drv.user;
  return { driver: drv, handle };
}
function scrubTripText(out: Record<string, unknown>): void {
  for (const k of TRIP_TEXT_FIELDS) if (typeof out[k] === 'string') out[k] = stripPhones(out[k] as string);
}
/**
 * `posterReveal`: extra carve-out for the browse case — when the viewer has applied to one of the
 * trip's poster's trips (per `can_reveal_agent` predicate), they get to see posted_by_name/phone too.
 * Computed by the caller before invoking this (an async predicate call).
 */
function redactTrip(raw: Record<string, unknown>, rel: ViewerRel, posterReveal = false): Record<string, unknown> {
  sortWaypoints(raw);
  const out = { ...raw };
  delete out.passenger_otp_hash;            // never anyone
  for (const k of TRIP_PII_COLS) delete out[k];
  // Posted-by handle (always present, lifted from joined users row)
  const posterUser = raw.posted_by_user as Record<string, unknown> | null | undefined;
  out.posted_by_handle = posterUser && typeof posterUser.display_handle === 'string' ? posterUser.display_handle : null;
  delete out.posted_by_user;
  // Assigned driver: shape + handle
  const shaped = shapeAssignedDriver(raw.assigned_driver as Record<string, unknown> | null | undefined);
  out.assigned_driver_handle = shaped.handle;
  // Free-text scrub for everyone (admins included — internal text shouldn't carry contact info)
  scrubTripText(out);
  if (rel === 'owner' || rel === 'admin') {
    out.passenger_name = raw.passenger_name;
    out.passenger_phone = raw.passenger_phone;
    out.posted_by_phone = raw.posted_by_phone;
    out.posted_by_name = raw.posted_by_name;
    out.assigned_driver = shaped.driver; // full identity + position
    if (typeof raw.passenger_otp === 'string' && raw.passenger_otp) out.passenger_otp = raw.passenger_otp;
    const dist = distanceToDest(raw);
    if (dist != null) out.distance_to_destination_km = dist;
  } else if (rel === 'accepted') {
    out.passenger_name = raw.passenger_name;
    out.posted_by_phone = raw.posted_by_phone;
    out.posted_by_name = raw.posted_by_name;
    if (!raw.hide_passenger_phone) out.passenger_phone = raw.passenger_phone;
    out.assigned_driver = shaped.driver; // their own — full identity + own position
    const dist = distanceToDest(raw);
    if (dist != null) out.distance_to_destination_km = dist;
  } else if (rel === 'selected') {
    // Phase 2 of two-step handshake: reveal agent's name + phone to the picked
    // driver so they can call to confirm BEFORE committing. Passenger details
    // stay hidden until /accept. No live position yet (no driver has accepted).
    out.posted_by_name = raw.posted_by_name;
    out.posted_by_phone = raw.posted_by_phone;
    out.assigned_driver = shaped.driver; // driver sees themselves
  } else {
    // browse: strip assigned-driver identity + position; optionally reveal poster name/phone if applicant
    if (shaped.driver) {
      const stripped = { ...shaped.driver };
      for (const k of DRIVER_PII_COLS) delete stripped[k];
      for (const k of DRIVER_POSITION_COLS) delete stripped[k];
      out.assigned_driver = stripped;
    } else {
      out.assigned_driver = null;
    }
    if (posterReveal) {
      out.posted_by_phone = raw.posted_by_phone;
      out.posted_by_name = raw.posted_by_name;
    }
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
      .select('id, posted_by_user_id, assigned_driver_id, assigned_acceptance_id, status, passenger_otp_hash, acceptance_window_minutes, acceptance_deadline_at, driver_acceptance_status, from_city_id, pickup_at, expected_end_at')
      .eq('id', id)
      .maybeSingle();
    return data as {
      id: string;
      posted_by_user_id: string;
      assigned_driver_id: string | null;
      assigned_acceptance_id: string | null;
      status: string;
      passenger_otp_hash: string | null;
      acceptance_window_minutes: number | null;
      acceptance_deadline_at: string | null;
      driver_acceptance_status: 'pending' | 'accepted' | 'declined' | 'expired' | null;
      from_city_id: string | null;
      pickup_at: string | null;
      expected_end_at: string | null;
    } | null;
  }
  /** Haversine distance in km — keeping it inline to avoid a PostGIS round-trip per driver. */
  function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(bLat - aLat);
    const dLng = toRad(bLng - aLng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  async function driverIdFor(userId: string): Promise<string | null> {
    const { data } = await db.from('drivers').select('id').eq('user_id', userId).maybeSingle();
    return (data?.id as string | undefined) ?? null;
  }
  /**
   * Find drivers eligible for an auto-invite to a trip from `fromCityId`:
   * active + KYC-approved drivers who have an open vacancy whose `current_city` is
   * within `app_settings.invite_max_radius_km` of the pickup city. Sorted by distance
   * ascending; caller decides whether to slice. Excludes `excludeDriverId` (used to
   * skip the driver who is posting the trip themselves).
   */
  async function findMatchingDrivers(
    fromCityId: string,
    excludeDriverId: string | null,
  ): Promise<Array<{ driverId: string; userId: string; distanceKm: number }>> {
    if (!fromCityId) return [];
    const { data: settings } = await db.from('app_settings').select('invite_max_radius_km').limit(1).maybeSingle();
    const maxKm = typeof settings?.invite_max_radius_km === 'number' ? settings.invite_max_radius_km : 15;
    const { data: pickupCity } = await db.from('cities').select('lat, lng').eq('id', fromCityId).maybeSingle();
    // cities.lat/lng are numeric(9,6) → supabase-js returns them as STRINGS to preserve precision.
    // Coerce explicitly; bail out only on NaN.
    const pLat = Number(pickupCity?.lat), pLng = Number(pickupCity?.lng);
    if (!Number.isFinite(pLat) || !Number.isFinite(pLng)) return [];
    const { data: vacRows } = await db
      .from('vacancies')
      .select('driver_id, current_city:cities!current_city_id(lat, lng), driver:drivers!driver_id(id, user_id, is_active, kyc_status)')
      .eq('status', 'active');
    type VacRow = {
      driver_id: string;
      current_city: { lat: number | string | null; lng: number | string | null } | null;
      driver: { id: string; user_id: string; is_active: boolean; kyc_status: string } | null;
    };
    const out: Array<{ driverId: string; userId: string; distanceKm: number }> = [];
    const seen = new Set<string>();
    for (const r of (vacRows as VacRow[] | null) ?? []) {
      if (!r.driver || r.driver.is_active === false || r.driver.kyc_status !== 'approved') continue;
      if (excludeDriverId && r.driver_id === excludeDriverId) continue;
      if (seen.has(r.driver_id)) continue;
      const lat = Number(r.current_city?.lat), lng = Number(r.current_city?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const km = distanceKm(pLat, pLng, lat, lng);
      if (km > maxKm) continue;
      seen.add(r.driver_id);
      out.push({ driverId: r.driver_id, userId: r.driver.user_id, distanceKm: km });
    }
    out.sort((a, b) => a.distanceKm - b.distanceKm);
    return out;
  }
  /**
   * Shared implementation for both manual `POST /trips/:id/invites` and the auto-invite
   * branch on `POST /trips`. Filters to active + KYC-approved drivers; gates by
   * `app_settings.invite_max_radius_km` against any open vacancy; preserves a prior
   * 'applied' acceptance status; upserts `trip_invitations`; sends a `trip_invitation`
   * notification to each invitee. Returns the created rows + the skipped driver ids.
   */
  async function inviteDrivers(
    trip: { id: string; from_city_id: string | null; posted_by_user_id: string },
    inviterUserId: string,
    driverIds: string[],
  ): Promise<{ created: { id: string; driver_id: string }[]; skipped: string[]; selfInvited: string[] }> {
    if (driverIds.length === 0) return { created: [], skipped: [], selfInvited: [] };
    const { data: eligible } = await db.from('drivers').select('id, user_id').in('id', driverIds).eq('is_active', true).eq('kyc_status', 'approved');
    let eligibleRows = (eligible ?? []) as { id: string; user_id: string }[];
    // A driver-user can't be invited to a trip they posted (they wear both hats).
    // This is independent of the *inviter* — admins can invite on behalf of an agent,
    // but the trip's actual poster is still the right person to exclude.
    const selfInvited = eligibleRows.filter((r) => r.user_id === trip.posted_by_user_id).map((r) => r.id);
    eligibleRows = eligibleRows.filter((r) => r.user_id !== trip.posted_by_user_id);
    const skipped = driverIds.filter((id) => !eligibleRows.some((r) => r.id === id) && !selfInvited.includes(id));
    if (eligibleRows.length > 0 && trip.from_city_id) {
      const { data: settings } = await db.from('app_settings').select('invite_max_radius_km').limit(1).maybeSingle();
      const maxKm = typeof settings?.invite_max_radius_km === 'number' ? settings.invite_max_radius_km : 15;
      const { data: pickupCity } = await db.from('cities').select('lat, lng').eq('id', trip.from_city_id).maybeSingle();
      const pLat = Number(pickupCity?.lat), pLng = Number(pickupCity?.lng);
      if (Number.isFinite(pLat) && Number.isFinite(pLng)) {
        const { data: vacRows } = await db
          .from('vacancies')
          .select('driver_id, current_city:cities!current_city_id(lat, lng)')
          .in('driver_id', eligibleRows.map((r) => r.id))
          .eq('status', 'active');
        type VacRow = { driver_id: string; current_city: { lat: number | string | null; lng: number | string | null } | null };
        const outOfRadius: string[] = [];
        for (const r of eligibleRows) {
          const v = (vacRows as VacRow[] | null)?.find((x) => x.driver_id === r.id);
          const lat = Number(v?.current_city?.lat), lng = Number(v?.current_city?.lng);
          if (Number.isFinite(lat) && Number.isFinite(lng)) {
            const km = distanceKm(pLat, pLng, lat, lng);
            if (km > maxKm) outOfRadius.push(r.id);
          }
        }
        if (outOfRadius.length > 0) {
          eligibleRows = eligibleRows.filter((r) => !outOfRadius.includes(r.id));
          skipped.push(...outOfRadius);
        }
      }
    }
    const now = new Date().toISOString();
    const { data: existingAcc } = await db
      .from('trip_acceptances')
      .select('driver_id, status')
      .eq('trip_id', trip.id)
      .in('driver_id', eligibleRows.map((r) => r.id))
      .in('status', ['applied', 'selected', 'accepted']);
    const appliedSet = new Set(((existingAcc ?? []) as { driver_id: string }[]).map((r) => r.driver_id));
    const rows = eligibleRows.map((r) => ({
      trip_id: trip.id,
      driver_id: r.id,
      invited_by_user_id: inviterUserId,
      status: (appliedSet.has(r.id) ? 'applied' : 'pending') as 'applied' | 'pending',
      declined_reason: null,
      updated_at: now,
    }));
    let created: { id: string; driver_id: string }[] = [];
    if (rows.length > 0) {
      const { data, error } = await db.from('trip_invitations').upsert(rows, { onConflict: 'trip_id,driver_id' }).select('id, driver_id, status');
      if (error) throw error;
      created = (data ?? []) as { id: string; driver_id: string }[];
      for (const r of eligibleRows) {
        await db.from('notifications').insert({
          user_id: r.user_id,
          type: 'trip_invitation',
          title: 'You\'ve been invited to a trip',
          body: 'A trip manager picked you to view a trip. Tap to see details and apply.',
          payload_json: { trip_id: trip.id },
        });
      }
    }
    return { created, skipped, selfInvited };
  }
  /**
   * Adds `posted_by_kyc_status` to each row by batch-fetching kyc_status from
   * drivers / trip_managers keyed on the poster's user_id (split by
   * posted_by_role: driver → drivers, anything else → trip_managers). Two
   * queries max regardless of row count, both indexed on user_id. Feeds the
   * client-side <VerifiedBadge> on every trip card without forcing per-row
   * round trips.
   */
  async function enrichPostedByKyc(rows: Record<string, unknown>[]): Promise<void> {
    if (rows.length === 0) return;
    const driverUserIds = new Set<string>();
    const agentUserIds = new Set<string>();
    for (const r of rows) {
      const uid = typeof r.posted_by_user_id === 'string' ? r.posted_by_user_id : '';
      const role = typeof r.posted_by_role === 'string' ? r.posted_by_role : '';
      if (!uid) continue;
      if (role === 'driver') driverUserIds.add(uid);
      else agentUserIds.add(uid);
    }
    const kyc = new Map<string, string>();
    if (driverUserIds.size > 0) {
      const { data } = await db.from('drivers').select('user_id, kyc_status').in('user_id', [...driverUserIds]);
      for (const d of (data ?? []) as { user_id: string; kyc_status: string }[]) kyc.set(d.user_id, d.kyc_status);
    }
    if (agentUserIds.size > 0) {
      const { data } = await db.from('trip_managers').select('user_id, kyc_status').in('user_id', [...agentUserIds]);
      for (const a of (data ?? []) as { user_id: string; kyc_status: string }[]) kyc.set(a.user_id, a.kyc_status);
    }
    for (const r of rows) {
      const uid = typeof r.posted_by_user_id === 'string' ? r.posted_by_user_id : '';
      if (uid && kyc.has(uid)) r.posted_by_kyc_status = kyc.get(uid);
    }
  }
  /**
   * Adds `pending_invitation_count` to each row — the number of `trip_invitations`
   * rows in status='pending' for that trip. Drives the "Invited" chip on
   * `/posted-trips` (agent's My posts). One indexed query per call, regardless
   * of row count; defaults to 0 when no invitations exist.
   */
  async function enrichPendingInvitationCount(rows: Record<string, unknown>[]): Promise<void> {
    if (rows.length === 0) return;
    const tripIds = rows.map((r) => (typeof r.id === 'string' ? r.id : '')).filter(Boolean);
    if (tripIds.length === 0) return;
    const { data } = await db.from('trip_invitations').select('trip_id').in('trip_id', tripIds).eq('status', 'pending');
    const counts = new Map<string, number>();
    for (const r of (data ?? []) as { trip_id: string }[]) counts.set(r.trip_id, (counts.get(r.trip_id) ?? 0) + 1);
    for (const r of rows) {
      const id = typeof r.id === 'string' ? r.id : '';
      r.pending_invitation_count = id ? counts.get(id) ?? 0 : 0;
    }
  }
  /** Re-fetch a trip joined + redacted for the viewer `u` (used by POST/assign/start/complete/cancel). */
  async function fullTrip(id: string, u: { id: string; role: string }): Promise<Record<string, unknown>> {
    const { data, error } = await db.from('trips').select(TRIP_SELECT).eq('id', id).single();
    if (error) throw new Error(error.message);
    const raw = data as Record<string, unknown>;
    await enrichPostedByKyc([raw]);
    await enrichPendingInvitationCount([raw]);
    await enrichPlatformFeeBreakdown([raw]);
    const myDriverId = (u.role !== 'admin' && raw.posted_by_user_id !== u.id && raw.assigned_driver_id) ? await driverIdFor(u.id) : null;
    return redactTrip(raw, relationshipFor(raw, u, myDriverId), false);
  }

  /**
   * Stage-3: attach { driver: {amount_paise, status, payment_source}, agent: {...} }
   * to the trip. Empty {} when the trip hasn't completed yet (no fee charges exist).
   */
  async function enrichPlatformFeeBreakdown(rows: Record<string, unknown>[]): Promise<void> {
    if (rows.length === 0) return;
    const ids = rows.map((r) => typeof r.id === 'string' ? r.id : '').filter(Boolean);
    if (ids.length === 0) return;
    const { data } = await db
      .from('platform_fee_charges')
      .select('trip_id, side, amount_paise, payment_source, status')
      .in('trip_id', ids);
    const m = new Map<string, { driver?: Record<string, unknown>; agent?: Record<string, unknown> }>();
    for (const row of (data ?? []) as Record<string, unknown>[]) {
      const tid = String(row.trip_id);
      const slot = m.get(tid) ?? {};
      const side = row.side === 'driver' ? 'driver' : 'agent';
      slot[side] = { amount_paise: Number(row.amount_paise), payment_source: row.payment_source, status: row.status };
      m.set(tid, slot);
    }
    for (const r of rows) {
      const tid = typeof r.id === 'string' ? r.id : '';
      r.platform_fee_breakdown = m.get(tid) ?? {};
    }
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
    // Migration 024: trips whose itinerary passes through this city (anywhere in the waypoint
    // chain — origin, intermediate stop, or final destination). Useful for drivers running an
    // alert on cities they could intercept en route.
    const viaCity = url.searchParams.get('via_city_id') ?? '';
    const postedBy = url.searchParams.get('posted_by_user_id') ?? '';
    const assignedDriverRaw = url.searchParams.get('assigned_driver_id') ?? '';
    let assignedDriver = assignedDriverRaw;
    if (assignedDriverRaw === 'me') {
      const did = await driverIdFor(u.id);
      if (!did) return ok([]); // no driver profile ⇒ nothing assigned to you
      assignedDriver = did;
    }
    // Phase 4: ?invited=me — driver's "Invited" tab. Resolves the caller's driver_id then
    // restricts the trip list to those carrying a pending/applied trip_invitations row. Declined
    // invites drop out of the queue immediately so the driver's Invited tab stays clean.
    const invitedParam = url.searchParams.get('invited');
    let invitedTripIds: string[] | null = null;
    let invitationByTripId: Map<string, { id: string; status: string }> | null = null;
    let invitedDriverId: string | null = null;
    if (invitedParam === 'me') {
      const did = await driverIdFor(u.id);
      if (!did) return ok([]); // no driver profile → nothing invited
      invitedDriverId = did;
      const { data: invs } = await db.from('trip_invitations').select('id, trip_id, status').eq('driver_id', did).in('status', ['pending', 'applied']);
      const rows = (invs ?? []) as { id: string; trip_id: string; status: string }[];
      invitationByTripId = new Map(rows.map((r) => [r.trip_id, { id: r.id, status: r.status }]));
      invitedTripIds = rows.map((r) => r.trip_id);
      if (invitedTripIds.length === 0) return ok([]);
    }
    const near = parseNearRadius(url);
    // `searchParams.get('limit')` returns null when the param is absent; Number(null) === 0 and is
    // finite, so the previous form fell through to limit=0 (empty list) on every unfiltered call.
    // Guard the null/empty case so the 50 default actually kicks in.
    const limitRaw = url.searchParams.get('limit');
    const limit = Math.min(limitRaw && Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : 50, 100);

    // Cache eligibility — only skip when the caller explicitly asks for in_progress trips,
    // because those rows carry the driver's live position (`current_lat/lng/at`) which a 30s
    // cache would stale by up to that long. Every other case (including no status filter at
    // all — driver "my trips", agent "posted by me", driver "invited") is cached: list views
    // surface route + payout + pickup, not real-time position; the trip detail page is a
    // separate endpoint that stays uncached and live. Up to 30s position lag in a list cell
    // is acceptable. Before 2026-05: this gate also required statusArr.length > 0, which
    // excluded ~43% of GET /trips traffic from the cache and capped hit rate ~2.65%.
    const statusArr = status ? status.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const cacheable = !statusArr.includes('in_progress');
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
      if (invitedTripIds) q = q.in('id', invitedTripIds);
      // via_city_id: filter to trips whose waypoint chain contains this city (any seq).
      if (viaCity) {
        const { data: wpRows, error: wpErr } = await db.from('trip_waypoints').select('trip_id').eq('city_id', viaCity);
        if (wpErr) throw new Error(wpErr.message);
        const tripIds = [...new Set(((wpRows ?? []) as { trip_id: string }[]).map((r) => r.trip_id))];
        if (tripIds.length === 0) return { rows: [], distEntries: null };
        q = q.in('id', tripIds);
      }
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
      const rows = (data ?? []) as Record<string, unknown>[];
      await enrichPostedByKyc(rows); // adds posted_by_kyc_status for the <VerifiedBadge>
      await enrichPendingInvitationCount(rows); // adds pending_invitation_count for the "Invited" chip on /posted-trips
      return { rows, distEntries };
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
            via_city_id: viaCity,
            posted_by_user_id: postedBy,
            assigned_driver_id: assignedDriver,
            // `invited=me` resolves to a caller-specific set of trip IDs (see invitedTripIds above).
            // Including the resolved driver_id as the cache-key fragment scopes the entry per-driver
            // so two drivers asking `?invited=me` never share an entry. Same trick we already use
            // for `assigned_driver_id=me` (resolved before this point).
            invited: invitedDriverId ? `me:${invitedDriverId}` : '',
            near_lat: near ? near.lat.toFixed(3) : '',
            near_lng: near ? near.lng.toFixed(3) : '',
            radius_m: near ? near.radiusM : '',
            limit,
          }),
          ttl: CacheTTL.SHORT,
          tier: 'shared',
          cacheType: 'live',
          entityKind: 'trip',
          entityId: 'list',
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
    const rc = revealCache(db);
    let rows = await Promise.all(rawRows.map(async (r) => {
      const rel = relationshipFor(r, u, myDriverId);
      let posterReveal = false;
      const posterUserId = r.posted_by_user_id as string | undefined;
      if (rel === 'browse') {
        if (posterUserId) {
          // Phase 4: ?invited=me trips pre-reveal the agent unconditionally — the
          // invited-trip-ids set we resolved above IS the reveal credential.
          if (invitedTripIds && invitedTripIds.includes(r.id as string)) posterReveal = true;
          else posterReveal = await rc.canRevealAgentUser(u.id, posterUserId);
          if (posterReveal) await logPiiReveal(db, { viewer_user_id: u.id, target_user_id: posterUserId, surface: 'GET /trips', trip_id: r.id as string });
        }
      } else if ((rel === 'selected' || rel === 'accepted') && posterUserId) {
        // The picked / accepted driver gets the agent's name + phone unconditionally (handshake
        // Phase 2/3). Log the reveal so the access pattern is auditable — same trail as the
        // applicant reveals above.
        await logPiiReveal(db, { viewer_user_id: u.id, target_user_id: posterUserId, surface: `GET /trips (${rel})`, trip_id: r.id as string });
      }
      const redacted = redactTrip(r, rel, posterReveal);
      // Phase 4 (2026-05-15): on `?invited=me`, stamp the driver's invitation_id + status onto
      // the row so the Invited tab can call `POST /trips/:id/invites/:invite_id/decline` without
      // a second round-trip. Only present when the row came from the invited-tripIds set.
      if (invitationByTripId) {
        const inv = invitationByTripId.get(r.id as string);
        if (inv) {
          (redacted as Record<string, unknown>).invitation_id = inv.id;
          (redacted as Record<string, unknown>).invitation_status = inv.status;
        }
      }
      return redacted;
    }));
    if (distById) {
      rows = rows.map((r) => ({ ...r, distance_km: distById.get(r.id as string) ?? null }))
                 .sort((a, b) => ((a.distance_km as number) ?? Infinity) - ((b.distance_km as number) ?? Infinity));
    }
    // /trips list is varies-by-viewer: NEVER public — CDN must not cache (see CACHE_BASELINE §4).
    return setCacheControl(tagCacheHit(ok(rows), hit), { ttl: CacheTTL.SHORT, scope: 'private' });
  }

  // ── POST /trips/trips ────────────────────────────────────────────────────
  if (!tripId && req.method === 'POST') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', 'Sign in to post a trip', 401);
    if (!(await rateLimitOk(db, `post-trip:${u.id}`, 60, 60))) return fail('RATE_LIMITED', 'Too many trips posted — try again shortly', 429);
    const b = await readBody(req);
    try {
      for (const f of TRIP_TEXT_FIELDS) assertNoPhones(typeof b[f] === 'string' ? (b[f] as string) : null, f);
    } catch (e) {
      if (e instanceof PhoneInTextError) return fail('VALIDATION', e.message, 400);
      throw e;
    }
    const distance = Number(b.expected_distance_km);
    const rate = Number(b.rate_per_km);
    if (!Number.isFinite(distance) || !Number.isFinite(rate) || !b.pickup_at || !b.car_type_id) {
      return fail('VALIDATION', 'pickup_at, car_type_id, expected_distance_km, rate_per_km are required', 422);
    }
    const pickupAtIso = String(b.pickup_at);
    // Resolve trip shape: a `waypoints[]` array (new style) OR legacy from_city_id/to_city_id (synthesised as a 2-waypoint one_way).
    const plan = await buildWaypointPlan(db, b, pickupAtIso);
    if (plan instanceof Response) return plan;
    if (typeof b.hide_passenger_phone !== 'boolean') {
      return fail('VALIDATION', 'hide_passenger_phone (a boolean) is required', 422);
    }
    const hidePassengerPhone = b.hide_passenger_phone;
    const passengerCount = Number(b.passenger_count);
    if (!Number.isInteger(passengerCount) || passengerCount < 1) {
      return fail('VALIDATION', 'passenger_count (a positive integer) is required', 422);
    }
    const totalFare = b.total_fare !== undefined && b.total_fare !== null ? Number(b.total_fare) : Math.round(distance * rate);
    const { data: usr } = await db.from('users').select('display_name, phone, role').eq('id', u.id).maybeSingle();
    const posterRole = usr?.role === 'driver' ? 'driver' : 'trip_manager';
    const { data: posterProf } = await (posterRole === 'driver'
      ? db.from('drivers').select('kyc_status, is_active, full_name, phone').eq('user_id', u.id).maybeSingle()
      : db.from('trip_managers').select('kyc_status, is_active, full_name, phone').eq('user_id', u.id).maybeSingle());
    if (posterProf?.is_active === false) return fail('ACCOUNT_SUSPENDED', 'Your account has been deactivated — contact support.', 403);
    if ((posterProf?.kyc_status as string) !== 'approved') return fail('KYC_REQUIRED', 'Complete your verification (KYC) before posting a trip', 403);
    // Snapshot the poster's real name + phone onto the trip row so redactTrip() can reveal them
    // once the driver acceptance handshake reaches a state where the rule allows it. Source of
    // truth is the poster's profile row (drivers/trip_managers); fall back through users.* then
    // empty string / null so we never block trip creation on missing optional fields.
    const posterFullName = ((posterProf?.full_name as string | null | undefined) || (usr?.display_name as string | null | undefined) || '').toString();
    const posterPhone = ((posterProf?.phone as string | null | undefined) || (usr?.phone as string | null | undefined) || '').toString();
    const insert = {
      posted_by_user_id: u.id,
      posted_by_role: posterRole,
      posted_by_name: posterFullName,
      posted_by_phone: posterPhone || null,
      trip_type: plan.trip_type,
      from_city_id: plan.from_city_id,
      to_city_id: plan.to_city_id,
      from_place_id: plan.from_place_id,
      to_place_id: plan.to_place_id,
      pickup_at: b.pickup_at,
      expected_end_at: plan.expected_end_at,
      expected_distance_km: distance,
      car_type_id: b.car_type_id,
      seats_required: b.seats_required ?? 4,
      ac_required: b.ac_required ?? true,
      rate_per_km: rate,
      total_fare: totalFare,
      commission_pct: b.commission_pct ?? 10,
      gst_amount: b.gst_amount ?? 0,
      driver_bata: b.driver_bata ?? 300,
      // Phase 1 of the two-step handshake — accept the trip-creator's window choice.
      // CHECK [5,30] is enforced at the DB; if omitted, falls back to the column default (15).
      ...(typeof b.acceptance_window_minutes === 'number' && Number.isFinite(b.acceptance_window_minutes)
        ? { acceptance_window_minutes: Math.min(30, Math.max(5, Math.round(b.acceptance_window_minutes))) }
        : {}),
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
    // Insert the waypoints (the mirror trigger reaffirms trips.from_*/to_*/expected_end_at).
    const wpRows = plan.waypoints.map((w) => ({ ...w, trip_id: created.id as string }));
    const { error: wpErr } = await db.from('trip_waypoints').insert(wpRows);
    if (wpErr) {
      // Roll back the orphan trip so the agent can fix + retry.
      await db.from('trips').delete().eq('id', created.id as string);
      return pgFail(wpErr);
    }
    // fire alert_match notifications for matching active alerts (best-effort; never fails the POST).
    try { await db.rpc('match_alerts_for_trip', { p_trip_id: created.id }); } catch { /* ignore */ }
    // Auto-invite the top 5 nearest available drivers (toggle defaults ON; OFF skips this).
    // Best-effort — invite failures must never break trip creation. The same eligibility +
    // radius rules as the manual invite path apply (shared `inviteDrivers` helper).
    let autoInvitedCount = 0;
    if (b.auto_invite_matches !== false) {
      try {
        const excludeDriverId = posterRole === 'driver' ? await driverIdFor(u.id) : null;
        const matches = await findMatchingDrivers(plan.from_city_id ?? '', excludeDriverId);
        const top5 = matches.slice(0, 5).map((m) => m.driverId);
        if (top5.length > 0) {
          const { created: inv } = await inviteDrivers(
            { id: created.id as string, from_city_id: plan.from_city_id ?? null, posted_by_user_id: u.id },
            u.id,
            top5,
          );
          autoInvitedCount = inv.length;
        }
      } catch { /* ignore — never fail the trip post */ }
    }
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
    await invalidateTripsList();
    const tripResp = await fullTrip(created.id as string, u);
    return ok({ ...tripResp, auto_invited_count: autoInvitedCount });
  }

  if (!tripId) return fail('NOT_FOUND', 'No such route', 404);

  // Defensive shape check. tripId is either a UUID (real trip) or one of the route
  // keywords below. Any other shape would cascade into a Postgres "invalid input
  // syntax for type uuid" 5xx from .eq('id', tripId). Reject with a clean 404 so
  // Sentry sees a routing miss instead of a UUID-cast crash (3 events / 2 users
  // surfaced this on 2026-05-16 when a client racey-fired a stale path).
  const TRIP_ROUTE_KEYWORDS = new Set(['match-preview', 'by-otp', 'applied']);
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!TRIP_ROUTE_KEYWORDS.has(tripId) && !UUID_RE.test(tripId)) {
    return fail('NOT_FOUND', 'No such route', 404);
  }

  // ── GET /trips/match-preview ?from_city_id=... ──
  // Counts only (no driver PII). Authed (any signed-in user). Drives the form preview.
  if (tripId === 'match-preview' && !sub && req.method === 'GET') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', 'Sign in', 401);
    if (!(await rateLimitOk(db, `match-preview:${u.id}`, 30, 60))) {
      return fail('RATE_LIMITED', 'Too many preview requests — try again shortly', 429);
    }
    const fromCityId = url.searchParams.get('from_city_id') ?? '';
    if (!fromCityId) return fail('VALIDATION', 'from_city_id is required', 422);
    const { data: usr } = await db.from('users').select('role').eq('id', u.id).maybeSingle();
    const excludeDriverId = (usr?.role === 'driver') ? await driverIdFor(u.id) : null;
    const matches = await findMatchingDrivers(fromCityId, excludeDriverId);
    const total = matches.length;
    const cap = 5;
    return ok({ total_matches: total, will_invite: Math.min(total, cap), max_invites: cap });
  }

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
    // flatten posted_by_handle off the joined users row (the passenger sees this alongside posted_by_name)
    const posterUser = row.posted_by_user as Record<string, unknown> | null | undefined;
    row.posted_by_handle = posterUser && typeof posterUser.display_handle === 'string' ? posterUser.display_handle : null;
    delete row.posted_by_user;
    // flatten the assigned driver's handle
    const drv = row.assigned_driver as Record<string, unknown> | null | undefined;
    if (drv) {
      const drvOut: Record<string, unknown> = { ...drv };
      const du = drvOut.user as Record<string, unknown> | null | undefined;
      drvOut.display_handle = du && typeof du.display_handle === 'string' ? du.display_handle : null;
      delete drvOut.user;
      row.assigned_driver = drvOut;
    }
    scrubTripText(row);
    sortWaypoints(row);
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
      .select('*, trip:trips!trip_id(*, posted_by_user:users!posted_by_user_id(display_handle), from_city:cities!from_city_id(*), to_city:cities!to_city_id(*), car_type:car_types(label), ' + WAYPOINTS_JOIN + ')')
      .eq('driver_id', did)
      .order('applied_at', { ascending: false });
    if (error) return fail('DB_ERROR', error.message, 500);
    const rows = (data ?? []).map((r) => {
      const rec = r as Record<string, unknown>;
      const t = rec.trip as Record<string, unknown> | null;
      // Migration 038 tightened `can_reveal_agent`: only acceptances in ('selected','accepted')
      // (or admin/self) reveal the poster's name/phone. The driver-scoped query above means the
      // caller is a driver, so admin/self aren't in play here — we can check the row's own status.
      if (t) {
        delete t.passenger_otp_hash; delete t.passenger_otp;
        delete t.passenger_name; delete t.passenger_phone;
        const posterUser = t.posted_by_user as Record<string, unknown> | null | undefined;
        t.posted_by_handle = posterUser && typeof posterUser.display_handle === 'string' ? posterUser.display_handle : null;
        delete t.posted_by_user;
        const accStatus = rec.status as string | undefined;
        if (accStatus !== 'selected' && accStatus !== 'accepted') {
          delete t.posted_by_name;
          delete t.posted_by_phone;
        }
        scrubTripText(t);
        sortWaypoints(t);
      }
      return shapeAcceptance(rec);
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
    await enrichPostedByKyc([raw]);
    await enrichPendingInvitationCount([raw]);
    await enrichPlatformFeeBreakdown([raw]);
    const myDriverId = (u.role !== 'admin' && raw.posted_by_user_id !== u.id && raw.assigned_driver_id) ? await driverIdFor(u.id) : null;
    const rel = relationshipFor(raw, u, myDriverId);
    let posterReveal = false;
    const posterUserId = raw.posted_by_user_id as string | undefined;
    if (rel === 'browse') {
      if (posterUserId) {
        const rc = revealCache(db);
        posterReveal = await rc.canRevealAgentUser(u.id, posterUserId);
        // Phase 4: invited drivers get the agent's name+phone pre-revealed BEFORE applying,
        // so they can call to discuss. The invitation row IS the reveal credential.
        if (!posterReveal && myDriverId) {
          const { data: inv } = await db.from('trip_invitations').select('id').eq('trip_id', raw.id as string).eq('driver_id', myDriverId).in('status', ['pending', 'applied']).maybeSingle();
          if (inv) posterReveal = true;
        }
        if (posterReveal) await logPiiReveal(db, { viewer_user_id: u.id, target_user_id: posterUserId, surface: 'GET /trips/:id', trip_id: raw.id as string });
      }
    } else if ((rel === 'selected' || rel === 'accepted') && posterUserId) {
      // The picked / accepted driver opens the trip detail and sees the agent's name + phone.
      // Audit it — same trail as the applicant reveal above.
      await logPiiReveal(db, { viewer_user_id: u.id, target_user_id: posterUserId, surface: `GET /trips/:id (${rel})`, trip_id: raw.id as string });
    }
    const redacted = redactTrip(raw, rel, posterReveal);
    // After-assignment counterparty verification: poster/admin gets the driver's checklist;
    // the assigned driver gets the poster's. We only attach on GET /trips/:id (detail) — the
    // builder makes 2-3 extra queries, which is fine for one trip but expensive for a list.
    if (raw.assigned_driver_id && (rel === 'owner' || rel === 'admin')) {
      const v = await buildDriverVerificationLite(db, raw.assigned_driver_id as string);
      const drv = redacted.assigned_driver as Record<string, unknown> | null | undefined;
      if (drv && v) (drv as Record<string, unknown>).verification = v;
    }
    if (rel === 'accepted') {
      const posterUserId = raw.posted_by_user_id as string | undefined;
      const posterRole = raw.posted_by_role as string | undefined;
      if (posterUserId) {
        const subjectId = posterRole === 'driver' ? await driverIdFor(posterUserId) : await agentIdForUser(db, posterUserId);
        if (subjectId) {
          const v = posterRole === 'driver'
            ? await buildDriverVerificationLite(db, subjectId)
            : await buildAgentVerificationLite(db, subjectId);
          if (v) redacted.posted_by_verification = v;
        }
      }
    }
    return ok(redacted);
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
      // poster/admin reading applicants — reveal is the design intent (each applicant has applied,
      // so `can_reveal_driver` is true); just shape the rows.
      return ok((data ?? []).map((r) => shapeAcceptance(r as Record<string, unknown>)));
    }
    if (!acceptanceId && req.method === 'POST') {
      const u = await authUser(db, req);
      if (!u) return fail('UNAUTHORIZED', 'Sign in to apply', 401);
      if (!(await rateLimitOk(db, `apply-trip:${u.id}`, 120, 60))) return fail('RATE_LIMITED', 'Too many applications — try again shortly', 429);
      // You can't apply to a trip you posted (a driver-user wearing both hats).
      const { data: tripOwner } = await db.from('trips').select('posted_by_user_id').eq('id', tripId).maybeSingle();
      if (!tripOwner) return fail('NOT_FOUND', 'Trip not found', 404);
      if ((tripOwner as { posted_by_user_id: string }).posted_by_user_id === u.id) {
        return fail('SELF_APPLY_FORBIDDEN', "You posted this trip — you can't apply to it.", 403);
      }
      const did = await driverIdFor(u.id);
      if (!did) return fail('FORBIDDEN', 'You need a driver profile to apply', 403);
      const { data: drv } = await db.from('drivers').select('kyc_status, is_active').eq('id', did).maybeSingle();
      if (drv?.is_active === false) return fail('ACCOUNT_SUSPENDED', 'Your driver account has been deactivated — contact support.', 403);
      if ((drv?.kyc_status as string) !== 'approved') return fail('KYC_REQUIRED', 'Complete your verification (KYC) before applying to trips', 403);
      const b = await readBody(req);
      try { assertNoPhones(typeof b.applicant_message === 'string' ? (b.applicant_message as string) : null, 'applicant_message'); } catch (e) {
        if (e instanceof PhoneInTextError) return fail('VALIDATION', e.message, 400);
        throw e;
      }
      // Vehicle eligibility (server-side guard — the picker filters too, but the API is the
      // source of truth). Year ≥ app_settings.min_vehicle_year, insurance not expired, vehicle
      // belongs to the applying driver, vehicle is active.
      const submittedVehicleId = (b.vehicle_id as string | null) ?? null;
      if (submittedVehicleId) {
        const { data: veh } = await db.from('vehicles')
          .select('driver_id, year, insurance_expiry, is_active')
          .eq('id', submittedVehicleId)
          .maybeSingle();
        if (!veh) return fail('VEHICLE_INELIGIBLE', 'Vehicle not found', 400);
        if ((veh as { driver_id: string }).driver_id !== did) return fail('VEHICLE_INELIGIBLE', 'That vehicle is not registered to you', 400);
        if ((veh as { is_active: boolean }).is_active === false) return fail('VEHICLE_INELIGIBLE', 'That vehicle is inactive — pick another or reactivate it.', 400);
        const { data: settings } = await db.from('app_settings').select('min_vehicle_year').eq('id', 1).maybeSingle();
        const minYear = Number((settings as { min_vehicle_year?: number } | null)?.min_vehicle_year ?? 2015);
        if (Number((veh as { year: number }).year) < minYear) return fail('VEHICLE_INELIGIBLE', `Vehicle too old — minimum year is ${minYear}.`, 400);
        const insExp = (veh as { insurance_expiry: string | null }).insurance_expiry;
        if (insExp && new Date(insExp).getTime() < Date.now()) return fail('VEHICLE_INELIGIBLE', 'Insurance has expired — renew before applying.', 400);
      }
      // A unique index on (trip_id, driver_id) prevents two acceptance rows for the same
      // driver+trip, even after withdraw/reject (DELETE soft-marks status='withdrawn',
      // doesn't remove the row). So re-applying after withdraw/reject = resurrect the
      // existing row back to 'applied'; only block if it's still in an open or decided-good
      // terminal state.
      const { data: existing } = await db
        .from('trip_acceptances')
        .select('id, status')
        .eq('trip_id', tripId)
        .eq('driver_id', did)
        .maybeSingle();
      let accId: string;
      if (existing) {
        const prev = String((existing as Record<string, unknown>).status);
        if (prev === 'applied' || prev === 'selected' || prev === 'expired') {
          return fail('CONFLICT', 'You already applied to this trip', 409);
        }
        // prev ∈ withdrawn | rejected — resurrect.
        const { error: updErr } = await db.from('trip_acceptances')
          .update({
            status: 'applied',
            applied_at: new Date().toISOString(),
            decision_at: null,
            decision_note: null,
            vehicle_id: (b.vehicle_id as string | null) ?? null,
            applicant_quoted_rate_per_km: (b.applicant_quoted_rate_per_km as number | null) ?? null,
            applicant_message: (b.applicant_message as string | null) ?? null,
          })
          .eq('id', (existing as Record<string, unknown>).id as string);
        if (updErr) return pgFail(updErr);
        accId = (existing as Record<string, unknown>).id as string;
      } else {
        const { data, error } = await db
          .from('trip_acceptances')
          .insert({ trip_id: tripId, driver_id: did, vehicle_id: (b.vehicle_id as string | null) ?? null, applicant_quoted_rate_per_km: (b.applicant_quoted_rate_per_km as number | null) ?? null, applicant_message: (b.applicant_message as string | null) ?? null, status: 'applied' })
          .select('id')
          .single();
        if (error) return error.code === '23505' ? fail('CONFLICT', 'You already applied to this trip', 409) : pgFail(error);
        accId = data.id as string;
      }
      await db.from('trips').update({ status: 'has_applicants' }).eq('id', tripId).eq('status', 'open');
      const { data: full } = await db.from('trip_acceptances').select(ACCEPTANCE_SELECT).eq('id', accId).single();
      await invalidateTripsList();
      return ok(shapeAcceptance(full as Record<string, unknown>));
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
      await invalidateTripsList();
      return ok({ withdrawn: acceptanceId });
    }
    if (acceptanceId && subsub === 'reject' && req.method === 'POST') {
      const u = await authUser(db, req);
      const trip = await loadTrip(tripId);
      if (!trip) return fail('NOT_FOUND', 'Trip not found', 404);
      if (!u || (trip.posted_by_user_id !== u.id && !isAdmin(u))) return fail('FORBIDDEN', '', 403);
      const b = await readBody(req);
      try { assertNoPhones(typeof b.decision_note === 'string' ? b.decision_note : null, 'decision_note'); } catch (e) {
        if (e instanceof PhoneInTextError) return fail('VALIDATION', e.message, 400);
        throw e;
      }
      const { data, error } = await db.from('trip_acceptances').update({ status: 'rejected', decision_at: new Date().toISOString(), decision_note: (b.decision_note as string | null) ?? null }).eq('id', acceptanceId).eq('trip_id', tripId).select(ACCEPTANCE_SELECT).single();
      if (error) return pgFail(error);
      await invalidateTripsList();
      return ok(shapeAcceptance(data as Record<string, unknown>));
    }
    return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed`, 405);
  }

  // ── POST /trips/:id/assign ─────────────────────────────────────────
  // Phase 2 of the two-step handshake: this no longer transitions straight to
  // `assigned`. Instead it moves the trip to `selected` and stamps an
  // acceptance deadline. The driver must POST /trips/:id/accept within the
  // window. If they don't, /trips/:id/decline / /trips/:id/cancel-assignment
  // / the cron expiry job (migration 031) all route back to `has_applicants`.
  // OTP generation moves to /accept (so a passenger never gets an OTP for a
  // trip the driver hasn't actually committed to).
  if (sub === 'assign' && req.method === 'POST') {
    const u = await authUser(db, req);
    const trip = await loadTrip(tripId);
    if (!trip) return fail('NOT_FOUND', 'Trip not found', 404);
    if (!u || (trip.posted_by_user_id !== u.id && !isAdmin(u))) return fail('FORBIDDEN', 'Only the trip poster can assign a driver', 403);
    if (!['open', 'has_applicants'].includes(trip.status as string)) {
      return fail('CONFLICT', `Trip is "${trip.status}", not selectable`, 409);
    }
    const b = await readBody(req);
    const aid = String(b.acceptance_id ?? '');
    const { data: acc } = await db.from('trip_acceptances').select('id, driver_id, vehicle_id').eq('id', aid).eq('trip_id', tripId).maybeSingle();
    if (!acc) return fail('VALIDATION', 'acceptance_id not found for this trip', 422);
    const { data: chosenDrv } = await db.from('drivers').select('is_active').eq('id', acc.driver_id).maybeSingle();
    if (chosenDrv?.is_active === false) return fail('VALIDATION', 'That driver has been deactivated — pick another applicant', 422);
    const now = new Date();
    const nowIso = now.toISOString();
    const windowMin = (trip.acceptance_window_minutes as number | null) ?? 15;
    const deadline = new Date(now.getTime() + windowMin * 60_000).toISOString();
    // The chosen acceptance row moves to 'selected'; sibling 'applied' rows stay applied (NOT rejected
    // yet — the agent might withdraw or the driver might decline, and we want those other applicants
    // still in the pool).
    await db.from('trip_acceptances').update({ status: 'selected', decision_at: nowIso }).eq('id', aid);
    const { error } = await db
      .from('trips')
      .update({
        status: 'selected',
        assigned_driver_id: acc.driver_id,
        assigned_vehicle_id: (acc.vehicle_id as string | null) ?? null,
        assigned_acceptance_id: aid,
        assigned_at: nowIso,
        acceptance_deadline_at: deadline,
        driver_acceptance_status: 'pending',
      })
      .eq('id', tripId);
    if (error) return pgFail(error);
    // Phase 3: notify the selected driver. Best-effort — a failed insert shouldn't
    // break the assign call. The handshake state is the source of truth; the
    // notification is just a heads-up.
    const { data: drvRow } = await db.from('drivers').select('user_id').eq('id', acc.driver_id).maybeSingle();
    const driverUserId = drvRow?.user_id as string | undefined;
    if (driverUserId) {
      await db.from('notifications').insert({
        user_id: driverUserId,
        type: 'trip_selected',
        title: 'You\'ve been selected for a trip',
        body: `Accept within ${windowMin} minutes or the trip goes back to other applicants.`,
        payload_json: { trip_id: tripId, deadline },
      });
    }
    const t = await fullTrip(tripId, u!);
    await invalidateTripsList();
    return ok(t);
  }

  // ── GET /trips/:id/overlapping-applications ──────────────────────────────
  // The currently-selected driver, before tapping Accept, asks: "which other
  // trips have I applied to that overlap this one?" The driver can then check
  // them off in the AcceptTripDialog and have those applications withdrawn
  // when accepting. Returns rows from trip_acceptances joined with their trip
  // (route + pickup + status); status IN ('applied','selected') only.
  if (sub === 'overlapping-applications' && req.method === 'GET') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', 'Sign in', 401);
    const trip = await loadTrip(tripId);
    if (!trip) return fail('NOT_FOUND', 'Trip not found', 404);
    const did = await driverIdFor(u.id);
    if (!did || (trip.assigned_driver_id !== did && !isAdmin(u))) {
      return fail('FORBIDDEN', 'Only the selected driver can see this list', 403);
    }
    if (!trip.pickup_at || !trip.expected_end_at) return ok([]);
    // Standard interval-overlap: other.pickup_at < A.expected_end_at
    // AND other.expected_end_at > A.pickup_at. We can't do the cross-row
    // predicate in one PostgREST query, so we filter in two steps: pull
    // applied/selected acceptances for this driver excluding this trip,
    // then filter in JS by the joined trip's times.
    const { data: rows, error } = await db
      .from('trip_acceptances')
      .select('id, trip_id, status, applied_at, applicant_quoted_rate_per_km, applicant_message, trip:trips!trip_id(id, status, pickup_at, expected_end_at, expected_distance_km, total_fare, driver_payout, rate_per_km, from_city:cities!from_city_id(id, name), to_city:cities!to_city_id(id, name))')
      .eq('driver_id', did)
      .neq('trip_id', tripId)
      .in('status', ['applied', 'selected']);
    if (error) return pgFail(error);
    type Row = { id: string; trip_id: string; status: string; applied_at: string; applicant_quoted_rate_per_km: number | null; applicant_message: string | null; trip: { pickup_at: string | null; expected_end_at: string | null } & Record<string, unknown> };
    const startA = new Date(trip.pickup_at).getTime();
    const endA = new Date(trip.expected_end_at).getTime();
    const overlapping = (rows as Row[] | null ?? []).filter((r) => {
      const ts = r.trip?.pickup_at ? new Date(r.trip.pickup_at).getTime() : NaN;
      const te = r.trip?.expected_end_at ? new Date(r.trip.expected_end_at).getTime() : NaN;
      if (!isFinite(ts) || !isFinite(te)) return false;
      return ts < endA && te > startA;
    });
    return ok(overlapping);
  }

  // ── POST /trips/:id/accept (Phase 2 of two-step handshake) ────────────────
  // The driver the agent picked taps Accept. Server checks status is still
  // 'selected', caller is the selected driver. Generates the passenger OTP,
  // flips the trip to 'accepted', rejects the other applicants, sets up the
  // trip_executions row, and SMSes the passenger out-of-band (placeholder
  // here — real SMS hookup is a follow-up).
  if (sub === 'accept' && req.method === 'POST') {
    const u = await authUser(db, req);
    const trip = await loadTrip(tripId);
    if (!trip) return fail('NOT_FOUND', 'Trip not found', 404);
    if (trip.status !== 'selected') return fail('CONFLICT', `Trip is "${trip.status}", not "selected" — agent may have withdrawn or it expired`, 409);
    const did = u ? await driverIdFor(u.id) : null;
    if (!u || (trip.assigned_driver_id !== did && !isAdmin(u))) return fail('FORBIDDEN', 'Only the selected driver can accept', 403);
    // Re-check KYC + active flags at accept time — the driver may have been deactivated
    // between selection and now.
    if (did) {
      const { data: drv } = await db.from('drivers').select('is_active, kyc_status').eq('id', did).maybeSingle();
      if (drv?.is_active === false) return fail('ACCOUNT_SUSPENDED', 'Your driver account is deactivated', 403);
      if (drv?.kyc_status !== 'approved') return fail('KYC_REQUIRED', 'Complete your verification (KYC) before accepting', 403);
    }
    const now = new Date().toISOString();
    const otp = genOtp();
    const otpHash = await sha256hex(otp);

    // Optional: withdraw the driver's other applications they confirmed via
    // the AcceptTripDialog. Each id must belong to the caller's driver. If the
    // sibling trip was 'selected' with this driver pending acceptance, also
    // revert that trip — same path as POST /decline (status → has_applicants,
    // clear assigned_*, fire trip_assignment_cancelled to its poster).
    const b = await readBody(req).catch(() => ({} as Record<string, unknown>));
    const withdrawIds = Array.isArray(b.withdraw_acceptance_ids)
      ? (b.withdraw_acceptance_ids as unknown[]).filter((x): x is string => typeof x === 'string' && x.length > 0)
      : [];
    if (withdrawIds.length > 0 && did) {
      const { data: rowsToWithdraw } = await db
        .from('trip_acceptances')
        .select('id, trip_id, status')
        .in('id', withdrawIds)
        .eq('driver_id', did);
      const ownedIds = (rowsToWithdraw ?? []).map((r) => r.id as string);
      if (ownedIds.length > 0) {
        await db.from('trip_acceptances').update({ status: 'withdrawn', decision_at: now }).in('id', ownedIds);
      }
      for (const r of (rowsToWithdraw ?? []) as { id: string; trip_id: string; status: string }[]) {
        if (r.status !== 'selected') continue; // only `selected` siblings need trip-side revert
        const { data: stillApplied } = await db.from('trip_acceptances').select('id').eq('trip_id', r.trip_id).eq('status', 'applied').limit(1);
        const fallbackStatus = (stillApplied && stillApplied.length > 0) ? 'has_applicants' : 'open';
        await db.from('trips').update({
          status: fallbackStatus,
          assigned_driver_id: null,
          assigned_vehicle_id: null,
          assigned_acceptance_id: null,
          assigned_at: null,
          acceptance_deadline_at: null,
          driver_acceptance_status: 'declined',
        }).eq('id', r.trip_id);
        // Notify the OTHER trip's poster — the driver took a different trip.
        const { data: otherTrip } = await db.from('trips').select('posted_by_user_id').eq('id', r.trip_id).maybeSingle();
        if (otherTrip?.posted_by_user_id) {
          await db.from('notifications').insert({
            user_id: otherTrip.posted_by_user_id,
            type: 'trip_assignment_cancelled',
            title: 'Driver took another trip',
            body: 'The selected driver accepted a different trip. Pick another applicant.',
            payload_json: { trip_id: r.trip_id, accepted_trip_id: tripId },
          });
        }
      }
    }

    // Reject the other applicants now that the driver has actually committed.
    await db.from('trip_acceptances').update({ status: 'rejected', decision_at: now }).eq('trip_id', tripId).neq('id', trip.assigned_acceptance_id).in('status', ['applied']);
    // Flip the accepting driver's acceptance row to 'accepted' so the row's status
    // agrees with the trip's. (Migration 037 broadened the CHECK to allow this value.)
    if (trip.assigned_acceptance_id) {
      await db.from('trip_acceptances').update({ status: 'accepted', decision_at: now }).eq('id', trip.assigned_acceptance_id);
    }
    const { error } = await db
      .from('trips')
      .update({
        status: 'accepted',
        driver_acceptance_status: 'accepted',
        passenger_otp_hash: otpHash,
        passenger_otp: otp,
      })
      .eq('id', tripId);
    if (error) return pgFail(error);
    await db.from('trip_executions').upsert({ trip_id: tripId }, { onConflict: 'trip_id', ignoreDuplicates: true });
    // Migration 039: any active vacancy whose window covers this trip's pickup is now
    // 'on_trip' (hidden from agent search, banner on the driver's IAmAvailableCard).
    await syncVacanciesForTrip(db, 'accept', tripId, {
      driverId: did,
      pickupAt: trip.pickup_at,
      expectedEndAt: trip.expected_end_at,
    });
    // Phase 3: notify the agent that the driver accepted (the OTP is now in play).
    await db.from('notifications').insert({
      user_id: trip.posted_by_user_id,
      type: 'trip_assigned',
      title: 'Driver accepted — share the OTP with your passenger',
      body: 'The driver confirmed. Open the trip to copy the passenger OTP.',
      payload_json: { trip_id: tripId },
    });
    const t = await fullTrip(tripId, u!);
    await invalidateTripsList();
    // OTP echoed for dev parity; the agent UI uses this to copy/share with the passenger.
    return ok({ ...(t as Record<string, unknown>), passenger_otp: otp });
  }

  // ── POST /trips/:id/decline (Phase 2 of two-step handshake) ───────────────
  // Selected driver bows out before accepting. Trip falls back to
  // 'has_applicants'; this driver's acceptance row → 'declined' (they're out
  // of the pool — see docs §5). Other applicants stay 'applied'.
  if (sub === 'decline' && req.method === 'POST') {
    const u = await authUser(db, req);
    const trip = await loadTrip(tripId);
    if (!trip) return fail('NOT_FOUND', 'Trip not found', 404);
    if (trip.status !== 'selected') return fail('CONFLICT', `Trip is "${trip.status}", not "selected"`, 409);
    const did = u ? await driverIdFor(u.id) : null;
    if (!u || (trip.assigned_driver_id !== did && !isAdmin(u))) return fail('FORBIDDEN', 'Only the selected driver can decline', 403);
    const b = await readBody(req).catch(() => ({} as Record<string, unknown>));
    const reason = typeof b.reason === 'string' && b.reason ? b.reason : null;
    const now = new Date().toISOString();
    await db.from('trip_acceptances').update({ status: 'declined', decision_at: now, decision_note: reason }).eq('id', trip.assigned_acceptance_id);
    // Restore the trip's selectable state. Other applicants stay applied; the agent picks again.
    const { data: stillApplied } = await db.from('trip_acceptances').select('id').eq('trip_id', tripId).eq('status', 'applied').limit(1);
    const fallbackStatus = (stillApplied && stillApplied.length > 0) ? 'has_applicants' : 'open';
    const { error } = await db
      .from('trips')
      .update({
        status: fallbackStatus,
        assigned_driver_id: null,
        assigned_vehicle_id: null,
        assigned_acceptance_id: null,
        assigned_at: null,
        acceptance_deadline_at: null,
        driver_acceptance_status: 'declined',
      })
      .eq('id', tripId);
    if (error) return pgFail(error);
    // Phase 3: notify the agent that the driver declined — they need to pick another.
    await db.from('notifications').insert({
      user_id: trip.posted_by_user_id,
      type: 'driver_declined',
      title: 'Driver declined the trip',
      body: reason ? `Reason: ${reason}. Pick another applicant.` : 'They\'re no longer in the pool. Pick another applicant.',
      payload_json: { trip_id: tripId, reason },
    });
    const t = await fullTrip(tripId, u!);
    await invalidateTripsList();
    return ok(t);
  }

  // ── POST /trips/:id/cancel-assignment (Phase 2 of two-step handshake) ─────
  // Trip creator pulls the selection (or the assignment) back. The driver's
  // acceptance row → 'applied' (they're still in the pool — it's the agent's
  // change of mind, not theirs). Cannot be used after status='in_progress'.
  if (sub === 'cancel-assignment' && req.method === 'POST') {
    const u = await authUser(db, req);
    const trip = await loadTrip(tripId);
    if (!trip) return fail('NOT_FOUND', 'Trip not found', 404);
    if (!u || (trip.posted_by_user_id !== u.id && !isAdmin(u))) return fail('FORBIDDEN', 'Only the trip poster can cancel an assignment', 403);
    if (!['selected', 'accepted'].includes(trip.status as string)) {
      return fail('CONFLICT', `Trip is "${trip.status}", not selected/assigned`, 409);
    }
    const b = await readBody(req).catch(() => ({} as Record<string, unknown>));
    const reason = typeof b.reason === 'string' && b.reason ? b.reason : null;
    const now = new Date().toISOString();
    if (trip.assigned_acceptance_id) {
      await db.from('trip_acceptances').update({ status: 'applied', decision_at: now, decision_note: reason }).eq('id', trip.assigned_acceptance_id);
    }
    const { error } = await db
      .from('trips')
      .update({
        status: 'has_applicants',
        assigned_driver_id: null,
        assigned_vehicle_id: null,
        assigned_acceptance_id: null,
        assigned_at: null,
        acceptance_deadline_at: null,
        driver_acceptance_status: null,
        passenger_otp_hash: null,
        passenger_otp: null,
      })
      .eq('id', tripId);
    if (error) return pgFail(error);
    // Migration 039: if the trip was 'accepted' (driver had committed), restore that
    // driver's vacancy (or expire if its window has passed).
    await syncVacanciesForTrip(db, 'revert', tripId);
    // Phase 3: notify the driver that the agent withdrew. They're back to 'applied'.
    if (trip.assigned_driver_id) {
      const { data: drvRow } = await db.from('drivers').select('user_id').eq('id', trip.assigned_driver_id).maybeSingle();
      const driverUserId = drvRow?.user_id as string | undefined;
      if (driverUserId) {
        await db.from('notifications').insert({
          user_id: driverUserId,
          type: 'trip_assignment_cancelled',
          title: 'Agent withdrew the assignment',
          body: reason ? `Reason: ${reason}. You\'re back in the applicant pool.` : 'You\'re back in the applicant pool.',
          payload_json: { trip_id: tripId, reason },
        });
      }
    }
    const t = await fullTrip(tripId, u!);
    await invalidateTripsList();
    return ok(t);
  }

  // ── /trips/:id/invites — Phase 4 of the two-step handshake ───────────────
  // POST   /trips/:id/invites                 (poster/admin) — body: { driver_ids: string[] } — invite N drivers
  // GET    /trips/:id/invites                 (poster/admin) — list invitees with status
  // DELETE /trips/:id/invites/:invite_id      (poster/admin) — withdraw an invite (→ 'withdrawn')
  // POST   /trips/:id/invites/:invite_id/decline (invited driver) — body: { reason? }
  if (sub === 'invites') {
    const trip = await loadTrip(tripId);
    if (!trip) return fail('NOT_FOUND', 'Trip not found', 404);
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', 'Sign in', 401);
    const isOwner = trip.posted_by_user_id === u.id || isAdmin(u);

    // POST /trips/:id/invites — bulk create
    if (!acceptanceId && req.method === 'POST') {
      if (!isOwner) return fail('FORBIDDEN', 'Only the trip poster can invite drivers', 403);
      const b = await readBody(req);
      const ids = Array.isArray(b.driver_ids)
        ? (b.driver_ids as unknown[]).filter((x): x is string => typeof x === 'string' && x.length > 0)
        : [];
      if (ids.length === 0) return fail('VALIDATION', 'driver_ids must be a non-empty array of driver UUIDs', 422);
      try {
        const { created, skipped, selfInvited } = await inviteDrivers(
          { id: tripId, from_city_id: trip.from_city_id ?? null, posted_by_user_id: trip.posted_by_user_id },
          u.id,
          ids,
        );
        if (created.length === 0 && selfInvited.length === ids.length) {
          return fail('SELF_INVITE_FORBIDDEN', "You can't invite yourself to a trip you posted.", 403);
        }
        return ok({ created, skipped, self_invited: selfInvited });
      } catch (e) {
        const err = e as { code?: string; message?: string };
        return pgFail({ code: err.code, message: err.message ?? 'Failed to create invitations' });
      }
    }
    // GET /trips/:id/invites — list
    if (!acceptanceId && req.method === 'GET') {
      if (!isOwner) return fail('FORBIDDEN', 'Only the trip poster can list invitations', 403);
      const { data, error } = await db
        .from('trip_invitations')
        .select('id, driver_id, status, declined_reason, created_at, updated_at, driver:drivers!driver_id(id, user_id, full_name, phone, profile_photo_url, rating_avg, rating_count, total_trips_completed, kyc_status, user:users!user_id(display_handle))')
        .eq('trip_id', tripId)
        .order('created_at', { ascending: false });
      if (error) return pgFail(error);
      // Privacy rule: the actor (agent) reveals themselves on invite, but the recipient
      // (driver) stays anonymous to the agent until they reciprocate by applying. So we
      // strip full_name / phone / profile_photo_url from each invitee unless their
      // trip_invitations.status === 'applied' (i.e. they've moved from pending → applied
      // by opening / applying via the invite). Trust signals (rating, KYC, trip count,
      // handle) stay visible the whole time so the agent has something to act on.
      const flat = (data ?? []).map((row) => {
        const r = row as Record<string, unknown>;
        const reciprocated = r.status === 'applied';
        const drv = r.driver as Record<string, unknown> | null | undefined;
        if (drv) {
          const flatDrv = { ...drv };
          const uu = flatDrv.user as Record<string, unknown> | null | undefined;
          flatDrv.display_handle = uu && typeof uu.display_handle === 'string' ? uu.display_handle : null;
          delete flatDrv.user;
          if (!reciprocated) {
            for (const k of ['full_name', 'phone', 'profile_photo_url']) delete flatDrv[k];
          }
          r.driver = flatDrv;
        }
        return r;
      });
      return ok(flat);
    }
    // DELETE /trips/:id/invites/:invite_id — withdraw
    if (acceptanceId && !subsub && req.method === 'DELETE') {
      if (!isOwner) return fail('FORBIDDEN', 'Only the trip poster can withdraw an invitation', 403);
      const { error } = await db.from('trip_invitations').update({ status: 'withdrawn', updated_at: new Date().toISOString() }).eq('id', acceptanceId).eq('trip_id', tripId);
      if (error) return pgFail(error);
      return ok({ withdrawn: acceptanceId });
    }
    // POST /trips/:id/invites/:invite_id/decline — invited driver declines
    if (acceptanceId && subsub === 'decline' && req.method === 'POST') {
      const did = await driverIdFor(u.id);
      if (!did) return fail('FORBIDDEN', 'Only the invited driver can decline', 403);
      const { data: inv } = await db.from('trip_invitations').select('id, driver_id, status, invited_by_user_id').eq('id', acceptanceId).eq('trip_id', tripId).maybeSingle();
      if (!inv) return fail('NOT_FOUND', 'Invitation not found', 404);
      if ((inv as { driver_id: string }).driver_id !== did) return fail('FORBIDDEN', 'Not your invitation', 403);
      const b = await readBody(req).catch(() => ({} as Record<string, unknown>));
      const reason = typeof b.reason === 'string' && b.reason ? b.reason : null;
      const { error } = await db.from('trip_invitations').update({ status: 'declined', declined_reason: reason, updated_at: new Date().toISOString() }).eq('id', acceptanceId);
      if (error) return pgFail(error);
      // Notify the agent that the invitee said no.
      await db.from('notifications').insert({
        user_id: (inv as { invited_by_user_id: string }).invited_by_user_id,
        type: 'invitation_declined',
        title: 'An invitee declined your trip',
        body: reason ? `Reason: ${reason}` : 'They\'re not available for this trip.',
        payload_json: { trip_id: tripId, invite_id: acceptanceId },
      });
      return ok({ declined: acceptanceId });
    }
    return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed`, 405);
  }

  // ── POST /trips/trips/:id/start ──────────────────────────────────────────
  if (sub === 'start' && req.method === 'POST') {
    const u = await authUser(db, req);
    const trip = await loadTrip(tripId);
    if (!trip) return fail('NOT_FOUND', 'Trip not found', 404);
    const did = u ? await driverIdFor(u.id) : null;
    if (!u || (trip.assigned_driver_id !== did && !isAdmin(u))) return fail('FORBIDDEN', 'Only the assigned driver can start the trip', 403);
    if (trip.status !== 'accepted') return fail('CONFLICT', `Trip is "${trip.status}", not "accepted"`, 409);
    // Brute-force protection for the 5-digit passenger OTP: 5 attempts per driver+trip per 60s.
    if (!(await rateLimitOk(db, `start-trip:${u.id}:${tripId}`, 5, 60))) return fail('RATE_LIMITED', 'Too many wrong OTP attempts — wait a minute and retry', 429);
    const b = await readBody(req);
    const otpHash = await sha256hex(String(b.passenger_otp ?? ''));
    if (!trip.passenger_otp_hash || otpHash !== trip.passenger_otp_hash) return fail('INVALID_OTP', 'Incorrect passenger OTP', 401);
    const now = new Date().toISOString();
    await db.from('trips').update({ status: 'in_progress' }).eq('id', tripId);
    await db.from('trip_executions').upsert(
      { trip_id: tripId, started_at: now, start_odo_url: (b.start_odo_url as string | null) ?? null, start_odo_reading: (b.start_odo_reading as number | null) ?? null, start_odo_at: b.start_odo_url ? now : null },
      { onConflict: 'trip_id' },
    );
    // Migration 039: trip is now consumed → the linked 'on_trip' vacancy expires.
    await syncVacanciesForTrip(db, 'start', tripId);
    await invalidateTripsList();
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
    // Status update fires charge_platform_fee_on_complete (migration 044) which charges
    // BOTH the Driver-side and Agent-side platform fees atomically. If either wallet is
    // short, the trigger RAISES and the whole update is rolled back.
    const { error: completeErr } = await db.from('trips').update({ status: 'completed' }).eq('id', tripId);
    if (completeErr) {
      const msg = completeErr.message || '';
      if (msg.includes('INSUFFICIENT_WALLET_BALANCE_DRIVER')) {
        return fail('INSUFFICIENT_WALLET_BALANCE_DRIVER', 'Driver-side platform fee could not be charged — driver wallet is short. Driver must top up before this trip can be completed.', 402);
      }
      if (msg.includes('INSUFFICIENT_WALLET_BALANCE_AGENT')) {
        return fail('INSUFFICIENT_WALLET_BALANCE_AGENT', 'Agent-side platform fee could not be charged — agent (trip poster) wallet is short. Agent must top up before this trip can be completed.', 402);
      }
      return fail('DB_ERROR', msg, 500);
    }
    await db.from('trip_executions').upsert(
      { trip_id: tripId, completed_at: now, end_odo_url: (b.end_odo_url as string | null) ?? null, end_odo_reading: (b.end_odo_reading as number | null) ?? null, end_odo_at: b.end_odo_url ? now : null, driver_notes: (b.driver_notes as string | null) ?? null },
      { onConflict: 'trip_id' },
    );
    if (trip.assigned_driver_id) {
      const { data: d } = await db.from('drivers').select('total_trips_completed').eq('id', trip.assigned_driver_id).maybeSingle();
      if (d) await db.from('drivers').update({ total_trips_completed: (Number(d.total_trips_completed) || 0) + 1 }).eq('id', trip.assigned_driver_id);
    }
    // Notify the agent (trip poster) so they know to leave a review.
    if (trip.posted_by_user_id) {
      await db.from('notifications').insert({
        user_id: trip.posted_by_user_id,
        type: 'trip_completed',
        title: 'Trip completed',
        body: 'Your driver completed the trip — tap to leave a review.',
        payload_json: { trip_id: tripId },
      });
    }
    await invalidateTripsList();
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
    // Migration 039: if the trip had been accepted, restore the linked vacancy (or expire it).
    await syncVacanciesForTrip(db, 'revert', tripId);
    // If a driver had already accepted, tell them the trip is off — otherwise they'd
    // turn up at pickup with the OTP only to find the trip is gone.
    if (trip.assigned_driver_id) {
      const { data: drvRow } = await db.from('drivers').select('user_id').eq('id', trip.assigned_driver_id).maybeSingle();
      const driverUserId = drvRow?.user_id as string | undefined;
      if (driverUserId) {
        await db.from('notifications').insert({
          user_id: driverUserId,
          type: 'trip_cancelled',
          title: 'Trip cancelled',
          body: 'The agent cancelled this trip. You don\'t need to drive — and the OTP no longer works.',
          payload_json: { trip_id: tripId },
        });
      }
    }
    await invalidateTripsList();
    return ok(await fullTrip(tripId, u!));
  }

  // ── PATCH /trips/:id — update trip details ─────────────────────────────────
  // Passenger fields (name/phone/count, luggage, special_requests, hide_phone) editable until in_progress.
  // Commercial + scheduling + vehicle fields (rate, bata, commission, gst, pickup_at, car_type, ac, seats,
  // driver_instructions, extras_paid_by_passenger, show_fare_to_passenger) editable ONLY while status='open'
  // — once anyone has applied/been invited/been selected, terms are locked. Route (cities, waypoints,
  // distance) is never editable here — changing it is effectively a new trip.
  if (!sub && req.method === 'PATCH') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', 'Sign in to update a trip', 401);
    const { data: tripFull } = await db.from('trips').select('id, posted_by_user_id, status, pickup_at, expected_end_at, expected_distance_km, rate_per_km').eq('id', tripId).maybeSingle();
    if (!tripFull) return fail('NOT_FOUND', 'Trip not found', 404);
    const trip = tripFull as { id: string; posted_by_user_id: string; status: string; pickup_at: string | null; expected_end_at: string | null; expected_distance_km: number | null; rate_per_km: number | null };
    if (trip.posted_by_user_id !== u.id && !isAdmin(u)) return fail('FORBIDDEN', 'Only the trip poster can update this trip', 403);
    const blockingStatuses = ['in_progress', 'completed', 'cancelled'];
    if (blockingStatuses.includes(trip.status)) return fail('CONFLICT', 'Trip has started — it can no longer be edited', 422);
    const b = await readBody(req);
    const patch: Record<string, unknown> = {};

    // ── passenger fields (allowed any time pre-start) ──
    if ('passenger_name' in b) patch.passenger_name = (typeof b.passenger_name === 'string' && b.passenger_name.trim()) ? b.passenger_name.trim() : '';
    if ('passenger_phone' in b) patch.passenger_phone = (typeof b.passenger_phone === 'string' && b.passenger_phone.trim()) ? b.passenger_phone.trim() : '';
    if ('passenger_count' in b) {
      const pc = Number(b.passenger_count);
      if (!Number.isInteger(pc) || pc < 1) return fail('VALIDATION', 'passenger_count must be a positive integer', 422);
      patch.passenger_count = pc;
    }
    try {
      if ('luggage_notes' in b) assertNoPhones(typeof b.luggage_notes === 'string' ? (b.luggage_notes as string) : null, 'luggage_notes');
      if ('special_requests' in b) assertNoPhones(typeof b.special_requests === 'string' ? (b.special_requests as string) : null, 'special_requests');
      if ('driver_instructions' in b) assertNoPhones(typeof b.driver_instructions === 'string' ? (b.driver_instructions as string) : null, 'driver_instructions');
    } catch (e) {
      if (e instanceof PhoneInTextError) return fail('VALIDATION', e.message, 400);
      throw e;
    }
    if ('luggage_notes' in b) patch.luggage_notes = (b.luggage_notes as string | null) ?? null;
    if ('special_requests' in b) patch.special_requests = (b.special_requests as string | null) ?? null;
    if ('hide_passenger_phone' in b && typeof b.hide_passenger_phone === 'boolean') patch.hide_passenger_phone = b.hide_passenger_phone;

    // ── commercial / scheduling / vehicle fields (status='open' only) ──
    const COMMERCIAL_FIELDS = ['rate_per_km', 'driver_bata', 'commission_pct', 'gst_amount', 'pickup_at', 'car_type_id', 'ac_required', 'seats_required', 'driver_instructions', 'extras_paid_by_passenger', 'show_fare_to_passenger'] as const;
    const touchingCommercial = COMMERCIAL_FIELDS.some((f) => f in b);
    if (touchingCommercial && trip.status !== 'open') {
      return fail('CONFLICT', 'Trip details can only be edited while no driver has been invited or applied', 409);
    }
    if ('rate_per_km' in b) {
      const r = Number(b.rate_per_km);
      if (!Number.isFinite(r) || r <= 0) return fail('VALIDATION', 'rate_per_km must be a positive number', 422);
      patch.rate_per_km = r;
      // Recompute total_fare from the unchanged distance. The `trips_compute_payout` trigger
      // (migration 002 / re-defined in 024) then re-derives driver_payout from the new total_fare.
      const distance = Number(trip.expected_distance_km);
      if (Number.isFinite(distance)) patch.total_fare = Math.round(distance * r);
    }
    if ('driver_bata' in b) {
      const v = Number(b.driver_bata);
      if (!Number.isFinite(v) || v < 0) return fail('VALIDATION', 'driver_bata must be ≥ 0', 422);
      patch.driver_bata = v;
    }
    if ('commission_pct' in b) {
      const v = Number(b.commission_pct);
      if (!Number.isFinite(v) || v < 0 || v > 30) return fail('VALIDATION', 'commission_pct must be between 0 and 30', 422);
      patch.commission_pct = v;
    }
    if ('gst_amount' in b) {
      const v = Number(b.gst_amount);
      if (!Number.isFinite(v) || v < 0) return fail('VALIDATION', 'gst_amount must be ≥ 0', 422);
      patch.gst_amount = v;
    }
    if ('pickup_at' in b) {
      const iso = typeof b.pickup_at === 'string' ? b.pickup_at : '';
      const next = new Date(iso);
      if (!iso || Number.isNaN(next.getTime())) return fail('VALIDATION', 'pickup_at must be a valid ISO timestamp', 422);
      patch.pickup_at = iso;
      // Shift expected_end_at by the same delta so the trip duration is preserved.
      if (trip.pickup_at && trip.expected_end_at) {
        const oldStart = new Date(trip.pickup_at).getTime();
        const oldEnd = new Date(trip.expected_end_at).getTime();
        if (Number.isFinite(oldStart) && Number.isFinite(oldEnd) && oldEnd > oldStart) {
          patch.expected_end_at = new Date(next.getTime() + (oldEnd - oldStart)).toISOString();
        }
      }
    }
    if ('car_type_id' in b) {
      const v = typeof b.car_type_id === 'string' ? b.car_type_id : '';
      if (!v) return fail('VALIDATION', 'car_type_id is required', 422);
      patch.car_type_id = v;
    }
    if ('ac_required' in b && typeof b.ac_required === 'boolean') patch.ac_required = b.ac_required;
    if ('seats_required' in b) {
      const v = Number(b.seats_required);
      if (!Number.isInteger(v) || v < 1) return fail('VALIDATION', 'seats_required must be a positive integer', 422);
      patch.seats_required = v;
    }
    if ('driver_instructions' in b) patch.driver_instructions = (b.driver_instructions as string | null) ?? null;
    if ('extras_paid_by_passenger' in b && typeof b.extras_paid_by_passenger === 'boolean') patch.extras_paid_by_passenger = b.extras_paid_by_passenger;
    if ('show_fare_to_passenger' in b && typeof b.show_fare_to_passenger === 'boolean') patch.show_fare_to_passenger = b.show_fare_to_passenger;

    if (Object.keys(patch).length === 0) return ok(await fullTrip(tripId, u));
    const { error } = await db.from('trips').update(patch).eq('id', tripId);
    if (error) return pgFail(error);
    await invalidateTripsList();
    return ok(await fullTrip(tripId, u));
  }

  return fail('NOT_FOUND', 'No such trips route', 404);
});

serve(handler);
