/**
 * /vacancies/* — driver availability posts ("I'm in city X, willing to drive to one of these
 * destinations"). Public reads (agents browse); the owning driver writes. Bearer-validated for
 * writes; withTiming; verify_jwt = false (mirrors the migration-003 RLS "vacancies read /
 * owner-or-admin write" policy). Destinations live in the `vacancy_destinations` junction.
 *
 *   GET   /vacancies              ?current_city_id=&destination_city_id=&status=&driver_id=&limit=   (public)
 *   POST  /vacancies              (driver; Bearer) — body incl. destination_city_ids: string[]
 *   GET   /vacancies/:id          (public) — joins driver+vehicle summary, current_city, destination cities
 *   POST  /vacancies/:id/cancel   (owning driver/admin; Bearer)
 */
// @ts-expect-error — Deno std, resolved at runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsPreflight, ok, fail } from '../_shared/cors.ts';
import { withTiming } from '../_shared/timing.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { rateLimitOk } from '../_shared/rateLimit.ts';

type Db = ReturnType<typeof serviceClient>;
const VACANCY_SELECT =
  '*, driver:drivers(id, full_name, profile_photo_url, rating_avg, rating_count, total_trips_completed, top_tags, current_city:cities!current_city_id(*)), ' +
  'vehicle:vehicles(id, year, seats, ac, make:vehicle_makes(name), model:vehicle_models(name), car_type:car_types(label)), ' +
  'current_city:cities!current_city_id(*), vacancy_destinations(city:cities(*))';

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
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
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
  async function fullVacancy(vacancyId: string): Promise<Response> {
    const { data, error } = await db.from('vacancies').select(VACANCY_SELECT).eq('id', vacancyId).maybeSingle();
    if (error) return fail('DB_ERROR', error.message, 500);
    if (!data) return fail('NOT_FOUND', 'Vacancy not found', 404);
    return ok(data);
  }

  // ── GET /vacancies (list) ────────────────────────────────────────────────
  if (!id && req.method === 'GET') {
    let q = db.from('vacancies').select(VACANCY_SELECT);
    const city = url.searchParams.get('current_city_id');
    if (city) q = q.eq('current_city_id', city);
    const status = url.searchParams.get('status');
    if (status) q = q.eq('status', status);
    const driverId = url.searchParams.get('driver_id');
    if (driverId) q = q.eq('driver_id', driverId);
    const destCity = url.searchParams.get('destination_city_id');
    if (destCity) {
      const { data: rows } = await db.from('vacancy_destinations').select('vacancy_id').eq('city_id', destCity);
      const ids = (rows ?? []).map((r) => r.vacancy_id as string);
      if (ids.length === 0) return ok([]);
      q = q.in('id', ids);
    }
    const limit = Number(url.searchParams.get('limit') ?? '50');
    q = q.order('created_at', { ascending: false }).limit(Math.min(Number.isFinite(limit) ? limit : 50, 200));
    const { data, error } = await q;
    if (error) return fail('DB_ERROR', error.message, 500);
    return ok(data ?? []);
  }

  // ── POST /vacancies (driver — post my availability) ──────────────────────
  if (!id && req.method === 'POST') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', 'Sign in to post a vacancy', 401);
    if (!(await rateLimitOk(db, `post-vacancy:${u.id}`, 30, 60))) return fail('RATE_LIMITED', 'Too many vacancies posted — try again shortly', 429);
    const did = await driverIdFor(u.id);
    if (!did) return fail('FORBIDDEN', 'You need a driver profile to post a vacancy', 403);
    const { data: drvKyc } = await db.from('drivers').select('kyc_status').eq('id', did).maybeSingle();
    if ((drvKyc?.kyc_status as string) !== 'approved') return fail('KYC_REQUIRED', 'Complete your verification (KYC) before posting a vacancy', 403);
    const b = await readBody(req);
    const currentCityId = strOrNull(b.current_city_id);
    if (!currentCityId) return fail('VALIDATION', 'current_city_id is required', 422);
    const destIds = strArray(b.destination_city_ids);
    const insert = {
      driver_id: did,
      vehicle_id: strOrNull(b.vehicle_id),
      current_city_id: currentCityId,
      available_from: strOrNull(b.available_from) ?? new Date().toISOString(),
      available_until: strOrNull(b.available_until),
      min_rate_per_km: typeof b.min_rate_per_km === 'number' ? b.min_rate_per_km : null,
      notes: strOrNull(b.notes),
      status: 'active',
    };
    const { data: created, error } = await db.from('vacancies').insert(insert).select('id').single();
    if (error) return pgFail(error);
    const vacancyId = created.id as string;
    if (destIds.length > 0) {
      const { error: destErr } = await db.from('vacancy_destinations').insert(destIds.map((cityId) => ({ vacancy_id: vacancyId, city_id: cityId })));
      if (destErr) {
        await db.from('vacancies').delete().eq('id', vacancyId); // roll back the orphan
        return pgFail(destErr);
      }
    }
    return fullVacancy(vacancyId);
  }

  if (!id) return fail('NOT_FOUND', 'No such route', 404);

  // load the vacancy for ownership / 404
  const { data: vac } = await db.from('vacancies').select('id, driver_id, status').eq('id', id).maybeSingle();

  // ── GET /vacancies/:id ───────────────────────────────────────────────────
  if (!sub && req.method === 'GET') {
    if (!vac) return fail('NOT_FOUND', 'Vacancy not found', 404);
    return fullVacancy(id);
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
    return fullVacancy(id);
  }

  if (!vac) return fail('NOT_FOUND', 'Vacancy not found', 404);
  return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed`, 405);
});

serve(handler);
