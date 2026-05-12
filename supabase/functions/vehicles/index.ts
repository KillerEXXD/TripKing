/**
 * /vehicles/* — a driver's cars. Public reads; the owning driver (or admin) writes.
 * Bearer-validated for writes; withTiming; verify_jwt = false (mirrors the RLS
 * "vehicles read / owner-or-admin write" policy). `eligibility_status` is DERIVED here
 * (year vs app_settings.min_vehicle_year), never stored.
 *
 *   GET    /vehicles            ?driver_id=&include_inactive=&eligibility=&needs_attention=true
 *                               (eligibility = CSV of eligible|expiring_soon|expired; needs_attention=true ⇒ eligibility_status≠eligible — the admin eligibility dashboard)
 *   GET    /vehicles/:id
 *   POST   /vehicles            (driver) — driver_id = the caller's driver
 *   PATCH  /vehicles/:id         (owning driver/admin) — include {is_active} to enable/disable
 *   DELETE /vehicles/:id         (owning driver/admin) — 409 IN_USE if referenced
 */
// @ts-expect-error — Deno std, resolved at runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsPreflight, ok, fail } from '../_shared/cors.ts';
import { withTiming } from '../_shared/timing.ts';
import { serviceClient } from '../_shared/supabase.ts';

type Db = ReturnType<typeof serviceClient>;
const VEHICLE_SELECT =
  '*, make:vehicle_makes(name), model:vehicle_models(name), car_type:car_types(label), fuel_type:fuel_types(label)';

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
  if (error.code === '23503') return fail('IN_USE', `${error.message} — referenced; disable it instead of deleting`, 409);
  if (error.code === '23502' || error.code === '23514' || error.code === '22P02') return fail('VALIDATION', error.message, 422);
  return fail('DB_ERROR', error.message, 400);
}

async function eligibilityFor(db: Db, vehicles: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  if (vehicles.length === 0) return vehicles;
  const { data: s } = await db.from('app_settings').select('min_vehicle_year').eq('id', 1).maybeSingle();
  const minYear = Number(s?.min_vehicle_year) || 2015;
  return vehicles.map((v) => {
    const y = Number(v.year);
    const status = !Number.isFinite(y) ? undefined : y < minYear ? 'expired' : y < minYear + 1 ? 'expiring_soon' : 'eligible';
    return { ...v, eligibility_status: status };
  });
}

const handler = withTiming('vehicles', async (req: Request): Promise<Response> => {
  const pre = corsPreflight(req);
  if (pre) return pre;
  const db = serviceClient();
  const url = new URL(req.url);
  const m = url.pathname.match(/\/vehicles(?:\/(.+))?$/);
  const id = (m && m[1] ? m[1] : '').split('/').filter(Boolean)[0];

  async function vehicleOwnerDriverId(vehId: string): Promise<{ driverId: string } | null> {
    const { data } = await db.from('vehicles').select('driver_id').eq('id', vehId).maybeSingle();
    return data ? { driverId: data.driver_id as string } : null;
  }
  async function driverIdFor(userId: string): Promise<string | null> {
    const { data } = await db.from('drivers').select('id').eq('user_id', userId).maybeSingle();
    return (data?.id as string | undefined) ?? null;
  }
  async function returnVehicle(vehId: string): Promise<Response> {
    const { data, error } = await db.from('vehicles').select(VEHICLE_SELECT).eq('id', vehId).maybeSingle();
    if (error) return fail('DB_ERROR', error.message, 500);
    if (!data) return fail('NOT_FOUND', 'Vehicle not found', 404);
    const [withElig] = await eligibilityFor(db, [data as Record<string, unknown>]);
    return ok(withElig);
  }

  // GET /vehicles (list)
  if (!id && req.method === 'GET') {
    let q = db.from('vehicles').select(VEHICLE_SELECT).order('is_primary', { ascending: false }).order('created_at', { ascending: false });
    const driverId = url.searchParams.get('driver_id');
    if (driverId) q = q.eq('driver_id', driverId);
    if (url.searchParams.get('include_inactive') !== 'true') q = q.eq('is_active', true);
    q = q.limit(500);
    const { data, error } = await q;
    if (error) return fail('DB_ERROR', error.message, 500);
    let rows = await eligibilityFor(db, (data ?? []) as Record<string, unknown>[]);
    const elig = (url.searchParams.get('eligibility') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (elig.length) rows = rows.filter((v) => elig.includes(String(v.eligibility_status)));
    else if (url.searchParams.get('needs_attention') === 'true') rows = rows.filter((v) => v.eligibility_status !== 'eligible');
    return ok(rows);
  }

  // POST /vehicles (create — caller must be a driver)
  if (!id && req.method === 'POST') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', 'Sign in to add a vehicle', 401);
    const did = await driverIdFor(u.id);
    if (!did) return fail('FORBIDDEN', 'You need a driver profile to add a vehicle', 403);
    const b = await readBody(req);
    if (!b.car_type_id || b.year === undefined || b.year === null) return fail('VALIDATION', 'car_type_id and year are required', 422);
    const { data: created, error } = await db.from('vehicles').insert({ ...b, driver_id: did }).select('id').single();
    if (error) return pgFail(error);
    return returnVehicle(created.id as string);
  }

  if (!id) return fail('NOT_FOUND', 'No such route', 404);

  // GET /vehicles/:id
  if (req.method === 'GET') return returnVehicle(id);

  // PATCH /vehicles/:id  (owning driver/admin)
  if (req.method === 'PATCH' || req.method === 'PUT') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', '', 401);
    const owner = await vehicleOwnerDriverId(id);
    if (!owner) return fail('NOT_FOUND', 'Vehicle not found', 404);
    const did = await driverIdFor(u.id);
    if (owner.driverId !== did && !isAdmin(u)) return fail('FORBIDDEN', 'Not your vehicle', 403);
    const b = await readBody(req);
    delete b.driver_id; // can't reassign ownership
    delete b.id;
    const { error } = await db.from('vehicles').update(b).eq('id', id);
    if (error) return pgFail(error);
    return returnVehicle(id);
  }

  // DELETE /vehicles/:id  (owning driver/admin)
  if (req.method === 'DELETE') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', '', 401);
    const owner = await vehicleOwnerDriverId(id);
    if (!owner) return fail('NOT_FOUND', 'Vehicle not found', 404);
    const did = await driverIdFor(u.id);
    if (owner.driverId !== did && !isAdmin(u)) return fail('FORBIDDEN', 'Not your vehicle', 403);
    const { error } = await db.from('vehicles').delete().eq('id', id);
    if (error) return pgFail(error);
    return ok({ deleted: id });
  }

  return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed`, 405);
});

serve(handler);
