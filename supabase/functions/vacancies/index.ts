/**
 * /vacancies/* — driver availability posts ("I'm in city X, willing to drive to one of these
 * destinations"). Public reads (agents browse); the owning driver writes. Bearer-validated for
 * writes; withTiming; verify_jwt = false (mirrors the migration-003 RLS "vacancies read /
 * owner-or-admin write" policy). Destinations live in the `vacancy_destinations` junction.
 *
 *   GET   /vacancies              ?current_city_id=&destination_city_id=&destination_place_id=&status=&driver_id=&near_lat=&near_lng=&radius_km=&limit=   (public; vacancies of deactivated drivers are excluded)
 *   POST  /vacancies              (driver; Bearer; the driver must be is_active + KYC-approved) — body: current_city_id (required) + current_place_id?; destinations?: [{ cityId?, placeId? }]  (or the legacy parallel destination_city_ids?: string[] / destination_place_ids?: string[])
 *   GET   /vacancies/:id          (public) — joins driver+vehicle summary, current_city/current_place, destination cities + places
 *   POST  /vacancies/:id/cancel   (owning driver/admin; Bearer)
 *
 * Phase D: when all of ?near_lat&near_lng&radius_km are given, the list is restricted to vacancies
 * whose current point (place → city fallback) is within the radius (`vacancies_in_radius` SQL fn),
 * nearest first, each row carrying `distance_km`. After a vacancy is posted, `match_alerts_for_vacancy`
 * fires `alert_match` notifications for matching active alerts (the owner is never notified about their own).
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
import { setCacheControl } from '../_shared/httpCache.ts';
import { purgeCloudflareAsync, purgeUrlsFor } from '../_shared/cloudflarePurge.ts';
import { redactDriver, stripPhones, assertNoPhones, PhoneInTextError } from '../_shared/pii.ts';
import { authUser, isAdmin } from '../_shared/auth.ts';
import { readBody, pgFail } from '../_shared/http.ts';

const VACANCY_PURGE_URLS = purgeUrlsFor(['/functions/v1/vacancies']);

// LIVE tier — short TTLs, memory-only (per-isolate). The cluster has few isolates and a 30s
// staleness window is acceptable; the DB round-trip for a shared-cache lookup would erase the
// benefit. Bump the epoch when the response shape of GET /vacancies changes.
// v3 (2026-05-15): bumped after the QA-data reset wipe (scripts/reset-trips-qa.sql) to drop every cached vacancy row.
const CACHE_EPOCH = 'v3';
function vacanciesListKey(url: URL): string {
  const params: string[] = [];
  for (const [k, v] of Array.from(url.searchParams.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    // Round geo to 3 decimals (~110m precision) to raise the hit rate.
    if ((k === 'near_lat' || k === 'near_lng') && v) {
      const n = Number(v);
      params.push(`${k}-${Number.isFinite(n) ? n.toFixed(3) : v}`);
    } else {
      params.push(`${k}-${v}`);
    }
  }
  const tail = params.length ? `:${params.join(':')}` : '';
  return `vacancies:list${tail}:${CACHE_EPOCH}`;
}

type Db = ReturnType<typeof serviceClient>;
const VACANCY_SELECT =
  '*, driver:drivers(id, user_id, full_name, phone, email, profile_photo_url, rating_avg, rating_count, total_trips_completed, top_tags, kyc_status, user:users!user_id(display_handle), current_city:cities!current_city_id(*)), ' +
  'vehicle:vehicles(id, year, seats, ac, make:vehicle_makes(name), model:vehicle_models(name), car_type:car_types(label)), ' +
  'current_city:cities!current_city_id(*), current_place:places!current_place_id(*), vacancy_destinations(city:cities(*), place:places(*))';

/** Vacancies NEVER reveal driver PII (per design — applying/inviting is the gate). Flatten the driver's
 *  display_handle off `driver.user`, then strip name/phone/email/photo. Also scrubs phones from `notes`. */
function shapeVacancy(row: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!row) return row ?? null;
  const out = { ...row };
  const drv = out.driver as Record<string, unknown> | null | undefined;
  if (drv) {
    const flat: Record<string, unknown> = { ...drv };
    const u = flat.user as Record<string, unknown> | null | undefined;
    flat.display_handle = u && typeof u.display_handle === 'string' ? u.display_handle : null;
    delete flat.user;
    out.driver = redactDriver(flat as { id: string; user_id: string; [k: string]: unknown }, false);
  }
  if (typeof out.notes === 'string') out.notes = stripPhones(out.notes);
  return out;
}

const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
}
/** One `destinations: [{ cityId?, placeId? }]` entry → a { city_id, place_id } pair, or null if neither id is present. */
function parseDestEntry(e: unknown): { city_id: string | null; place_id: string | null } | null {
  if (!e || typeof e !== 'object') return null;
  const o = e as Record<string, unknown>;
  const city_id = strOrNull(o.cityId ?? o.city_id);
  const place_id = strOrNull(o.placeId ?? o.place_id);
  return city_id || place_id ? { city_id, place_id } : null;
}

const handler = withTiming('vacancies', async (req: Request): Promise<Response> => {
  const pre = corsPreflight(req);
  if (pre) return pre;
  const db = serviceClient();
  const url = new URL(req.url);
  const m = url.pathname.match(/\/vacancies(?:\/(.+))?$/);
  const segs = (m && m[1] ? m[1] : '').split('/').filter(Boolean);
  const id = segs[0];
  const sub = segs[1]; // 'cancel'

  async function driverIdFor(userId: string): Promise<string | null> {
    const { data } = await db.from('drivers').select('id').eq('user_id', userId).maybeSingle();
    return (data?.id as string | undefined) ?? null;
  }
  async function fullVacancy(vacancyId: string, cached: boolean): Promise<Response> {
    if (!cached) {
      const { data, error } = await db.from('vacancies').select(VACANCY_SELECT).eq('id', vacancyId).maybeSingle();
      if (error) return fail('DB_ERROR', error.message, 500);
      if (!data) return fail('NOT_FOUND', 'Vacancy not found', 404);
      return ok(shapeVacancy(data as Record<string, unknown>));
    }
    const { data, hit } = await withCache<Record<string, unknown> | null>(
      { key: `vacancies:item:${vacancyId}:${CACHE_EPOCH}`, ttl: CacheTTL.SHORT, tier: 'memory' },
      async () => {
        const { data, error } = await db.from('vacancies').select(VACANCY_SELECT).eq('id', vacancyId).maybeSingle();
        if (error) throw new Error(error.message);
        return shapeVacancy(data as Record<string, unknown> | null);
      },
    );
    if (!data) return fail('NOT_FOUND', 'Vacancy not found', 404);
    return setCacheControl(tagCacheHit(ok(data), hit), { ttl: CacheTTL.SHORT, scope: 'public' });
  }

  // ── GET /vacancies (list) — LIVE tier, 30s memory cache, public-safe ─────
  if (!id && req.method === 'GET') {
    const { data: rows, hit } = await withCache<Record<string, unknown>[]>(
      { key: vacanciesListKey(url), ttl: CacheTTL.SHORT, tier: 'memory' },
      async () => {
        let q = db.from('vacancies').select(VACANCY_SELECT);
        const city = url.searchParams.get('current_city_id');
        if (city) q = q.eq('current_city_id', city);
        const status = url.searchParams.get('status');
        if (status) q = q.eq('status', status);
        const driverId = url.searchParams.get('driver_id');
        if (driverId) q = q.eq('driver_id', driverId);
        // hide vacancies of deactivated drivers — the is_active flag must be honoured everywhere
        const { data: inactive } = await db.from('drivers').select('id').eq('is_active', false);
        const inactiveIds = (inactive ?? []).map((r) => r.id as string);
        if (inactiveIds.length) q = q.not('driver_id', 'in', `(${inactiveIds.join(',')})`);
        const destCity = url.searchParams.get('destination_city_id');
        const destPlace = url.searchParams.get('destination_place_id');
        if (destCity || destPlace) {
          let dq = db.from('vacancy_destinations').select('vacancy_id');
          if (destCity) dq = dq.eq('city_id', destCity);
          if (destPlace) dq = dq.eq('place_id', destPlace);
          const { data: drows } = await dq;
          const ids = [...new Set((drows ?? []).map((r) => r.vacancy_id as string))];
          if (ids.length === 0) return [];
          q = q.in('id', ids);
        }
        // Phase D radius filter
        const near = parseNearRadius(url);
        let distById: Map<string, number> | null = null;
        if (near) {
          const { data: rad, error: radErr } = await db.rpc('vacancies_in_radius', { p_lat: near.lat, p_lng: near.lng, p_radius_m: near.radiusM });
          if (radErr) throw new Error(radErr.message);
          const list = (rad ?? []) as { id: string; distance_m: number }[];
          if (list.length === 0) return [];
          distById = new Map(list.map((r) => [r.id, toKm(Number(r.distance_m))]));
          q = q.in('id', [...distById.keys()]);
        }
        const limit = Number(url.searchParams.get('limit') ?? '50');
        q = near
          ? q.limit(Math.min(Number.isFinite(limit) ? limit : 50, 200))
          : q.order('created_at', { ascending: false }).limit(Math.min(Number.isFinite(limit) ? limit : 50, 200));
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        let out = (data ?? []) as Record<string, unknown>[];
        if (distById) {
          out = out.map((r) => ({ ...r, distance_km: distById!.get(r.id as string) ?? null }))
                   .sort((a, b) => ((a.distance_km as number) ?? Infinity) - ((b.distance_km as number) ?? Infinity));
        }
        return out.map((r) => shapeVacancy(r) as Record<string, unknown>);
      },
    );
    return setCacheControl(tagCacheHit(ok(rows), hit), { ttl: CacheTTL.SHORT, scope: 'public' });
  }

  // ── POST /vacancies (driver — post my availability) ──────────────────────
  if (!id && req.method === 'POST') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', 'Sign in to post a vacancy', 401);
    if (!(await rateLimitOk(db, `post-vacancy:${u.id}`, 30, 60))) return fail('RATE_LIMITED', 'Too many vacancies posted — try again shortly', 429);
    const did = await driverIdFor(u.id);
    if (!did) return fail('FORBIDDEN', 'You need a driver profile to post a vacancy', 403);
    const { data: drv } = await db.from('drivers').select('kyc_status, is_active').eq('id', did).maybeSingle();
    if (drv?.is_active === false) return fail('ACCOUNT_SUSPENDED', 'Your driver account has been deactivated — contact support.', 403);
    if ((drv?.kyc_status as string) !== 'approved') return fail('KYC_REQUIRED', 'Complete your verification (KYC) before posting a vacancy', 403);
    const b = await readBody(req);
    try { assertNoPhones(typeof b.notes === 'string' ? b.notes : null, 'notes'); } catch (e) {
      if (e instanceof PhoneInTextError) return fail('VALIDATION', e.message, 400);
      throw e;
    }
    const currentCityId = strOrNull(b.current_city_id);
    if (!currentCityId) return fail('VALIDATION', 'current_city_id is required', 422);
    const currentPlaceId = strOrNull(b.current_place_id);
    // Destinations — prefer the unified `destinations: [{ cityId?, placeId? }]` array (each entry may be a
    // curated city, a precise place, or both); fall back to the legacy parallel `destination_*_ids` arrays.
    let destPairs: { city_id: string | null; place_id: string | null }[];
    if (Array.isArray(b.destinations) && b.destinations.length > 0) {
      const parsed = (b.destinations as unknown[]).map(parseDestEntry);
      if (parsed.some((p) => p === null)) return fail('VALIDATION', 'each `destinations` entry needs a cityId or a placeId', 422);
      destPairs = parsed as { city_id: string | null; place_id: string | null }[];
    } else {
      const destCityIds = strArray(b.destination_city_ids);
      const destPlaceIds = strArray(b.destination_place_ids);
      destPairs = destPlaceIds.length > 0
        ? destPlaceIds.map((placeId, i) => ({ place_id: placeId, city_id: destCityIds[i] ?? null }))
        : destCityIds.map((cityId) => ({ city_id: cityId, place_id: null }));
    }
    const insert = {
      driver_id: did,
      vehicle_id: strOrNull(b.vehicle_id),
      current_city_id: currentCityId,
      current_place_id: currentPlaceId,
      available_from: strOrNull(b.available_from) ?? new Date().toISOString(),
      available_until: strOrNull(b.available_until),
      min_rate_per_km: typeof b.min_rate_per_km === 'number' ? b.min_rate_per_km : null,
      notes: strOrNull(b.notes),
      status: 'active',
    };
    // Max ACTIVE vacancies per driver — admin-configurable via app_settings (default 2,
    // migration 022). Checked AFTER body validation so 422s for malformed bodies fire first
    // (validation errors take precedence over resource-limit errors). The "I'm available" card
    // on /vacancies (src/components/vacancy/IAmAvailableCard.tsx) reads the same value.
    //
    // Soft enforcement: an admin lowering the cap doesn't auto-cancel anyone's existing
    // vacancies — only NEW posts see the new ceiling.
    const { data: appSettings } = await db.from('app_settings').select('max_active_vacancies_per_driver').eq('id', 1).maybeSingle();
    const maxActive = Number(appSettings?.max_active_vacancies_per_driver ?? 2);
    const { count: activeCount } = await db
      .from('vacancies')
      .select('id', { count: 'exact', head: true })
      .eq('driver_id', did)
      .eq('status', 'active');
    if ((activeCount ?? 0) >= maxActive) {
      return fail('CONFLICT', `You already have ${maxActive} active vacanc${maxActive === 1 ? 'y' : 'ies'}. Cancel one before posting a new one.`, 409);
    }
    const { data: created, error } = await db.from('vacancies').insert(insert).select('id').single();
    if (error) return pgFail(error); // 23503 (bad current_place_id / current_city_id) → 422
    const vacancyId = created.id as string;
    if (destPairs.length > 0) {
      const { error: destErr } = await db.from('vacancy_destinations').insert(destPairs.map((p) => ({ vacancy_id: vacancyId, ...p })));
      if (destErr) {
        await db.from('vacancies').delete().eq('id', vacancyId); // roll back the orphan
        return pgFail(destErr);
      }
    }
    // fire alert_match notifications for matching active alerts (best-effort; never fails the POST).
    try { await db.rpc('match_alerts_for_vacancy', { p_vacancy_id: vacancyId }); } catch { /* ignore */ }
    cacheDeletePattern('vacancies:*');
    purgeCloudflareAsync(VACANCY_PURGE_URLS);
    return fullVacancy(vacancyId, false);
  }

  if (!id) return fail('NOT_FOUND', 'No such route', 404);

  // load the vacancy for ownership / 404
  const { data: vac } = await db.from('vacancies').select('id, driver_id, status').eq('id', id).maybeSingle();

  // ── GET /vacancies/:id ───────────────────────────────────────────────────
  if (!sub && req.method === 'GET') {
    if (!vac) return fail('NOT_FOUND', 'Vacancy not found', 404);
    return fullVacancy(id, true);
  }

  // ── POST /vacancies/:id/cancel (owning driver/admin) ─────────────────────
  if (sub === 'cancel' && req.method === 'POST') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', '', 401);
    if (!vac) return fail('NOT_FOUND', 'Vacancy not found', 404);
    if (!isAdmin(u)) {
      const did = await driverIdFor(u.id);
      if (vac.driver_id !== did) return fail('FORBIDDEN', 'Not your vacancy', 403);
    }
    if (vac.status === 'cancelled') return fail('CONFLICT', 'Vacancy is already cancelled', 409);
    const { error } = await db.from('vacancies').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', id);
    if (error) return pgFail(error);
    cacheDeletePattern('vacancies:*');
    purgeCloudflareAsync(VACANCY_PURGE_URLS);
    return fullVacancy(id, false);
  }

  if (!vac) return fail('NOT_FOUND', 'Vacancy not found', 404);
  return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed`, 405);
});

serve(handler);
