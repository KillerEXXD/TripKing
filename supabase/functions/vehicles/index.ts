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
 *   PATCH  /vehicles/:id         (owning driver/admin) — include {is_active} to enable/disable; accepts photo_*_url / rc_book_url / insurance_url / permit_url etc.
 *   DELETE /vehicles/:id         (owning driver/admin) — 409 IN_USE if referenced
 *   POST   /vehicles/:id/photo-upload-url (owning driver/admin) — { slot } → short-lived signed UPLOAD url into the private 'vehicle-photos' bucket at <vehicleId>/<slot>
 *                                slot ∈ front|back|left|right|plate|interior|rc|insurance|permit ; response includes the column to store the public path into
 */
// @ts-expect-error — Deno std, resolved at runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsPreflight, ok, fail } from '../_shared/cors.ts';
import { withTiming } from '../_shared/timing.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { authUser, isAdmin } from '../_shared/auth.ts';
import { readBody, pgFail as pgFailShared } from '../_shared/http.ts';
import { maybePromoteToReadyForApproval } from '../_shared/kyc.ts';

const pgFail = (e: { code?: string; message: string }) => pgFailShared(e, { fkAs: 'IN_USE' });

type Db = ReturnType<typeof serviceClient>;
type Row = Record<string, unknown>;
const VEHICLE_SELECT =
  '*, make:vehicle_makes(name), model:vehicle_models(name), car_type:car_types(label), fuel_type:fuel_types(label)';
const PHOTO_SLOTS = ['front', 'back', 'left', 'right', 'plate', 'interior', 'rc', 'insurance', 'permit'] as const;
type PhotoSlot = (typeof PHOTO_SLOTS)[number];
const SLOT_TO_COL: Record<PhotoSlot, string> = {
  front: 'photo_front_url', back: 'photo_back_url', left: 'photo_left_url', right: 'photo_right_url',
  plate: 'photo_plate_url', interior: 'photo_interior_url', rc: 'rc_book_url', insurance: 'insurance_url', permit: 'permit_url',
};

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

async function eligibilityFor(db: Db, vehicles: Row[]): Promise<Row[]> {
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
  const segs = (m && m[1] ? m[1] : '').split('/').filter(Boolean);
  const id = segs[0];
  const sub = segs[1]; // 'photo-upload-url'

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
    const [withElig] = await eligibilityFor(db, [data as Row]);
    return ok(withElig);
  }

  // GET /vehicles (list, paginated)
  // Query: ?page= (1-based, default 1) ?limit= (default 50, max 200). The eligibility
  // filter is server-side-derived (year vs app_settings.min_vehicle_year), so we load
  // candidates, derive + filter, then slice the page. `meta.total` is the filtered set
  // size; `has_more` is computed from page + slice.
  if (!id && req.method === 'GET') {
    const limit = Math.min(Math.max(1, Number(url.searchParams.get('limit') ?? '50') || 50), 200);
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
    const from = (page - 1) * limit;

    let q = db.from('vehicles').select(VEHICLE_SELECT).order('is_primary', { ascending: false }).order('created_at', { ascending: false });
    const driverId = url.searchParams.get('driver_id');
    if (driverId) q = q.eq('driver_id', driverId);
    if (url.searchParams.get('include_inactive') !== 'true') q = q.eq('is_active', true);
    q = q.limit(1000);
    const { data, error } = await q;
    if (error) return fail('DB_ERROR', error.message, 500);
    let rows = await eligibilityFor(db, (data ?? []) as Row[]);
    const elig = (url.searchParams.get('eligibility') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (elig.length) rows = rows.filter((v) => elig.includes(String(v.eligibility_status)));
    else if (url.searchParams.get('needs_attention') === 'true') rows = rows.filter((v) => v.eligibility_status !== 'eligible');
    const total = rows.length;
    const pageRows = rows.slice(from, from + limit);
    return ok(pageRows, { total, page, limit, has_more: from + pageRows.length < total });
  }

  // POST /vehicles (create — caller must be a driver)
  if (!id && req.method === 'POST') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', 'Sign in to add a vehicle', 401);
    const did = await driverIdFor(u.id);
    if (!did) return fail('FORBIDDEN', 'You need a driver profile to add a vehicle', 403);
    const b = await readBody(req);
    if (!b.car_type_id || b.year === undefined || b.year === null) return fail('VALIDATION', 'car_type_id and year are required', 422);
    delete b.eligibility_status; // derived, never stored
    const { data: created, error } = await db.from('vehicles').insert({ ...b, driver_id: did }).select('id').single();
    if (error) return pgFail(error);
    await maybePromoteToReadyForApproval(db, 'driver', did);
    return returnVehicle(created.id as string);
  }

  if (!id) return fail('NOT_FOUND', 'No such route', 404);

  // GET /vehicles/:id
  if (!sub && req.method === 'GET') return returnVehicle(id);

  // POST /vehicles/:id/photo-upload-url (owning driver/admin) — signed UPLOAD url
  if (sub === 'photo-upload-url' && req.method === 'POST') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', '', 401);
    const owner = await vehicleOwnerDriverId(id);
    if (!owner) return fail('NOT_FOUND', 'Vehicle not found', 404);
    const did = await driverIdFor(u.id);
    if (owner.driverId !== did && !isAdmin(u)) return fail('FORBIDDEN', 'Not your vehicle', 403);
    const b = await readBody(req);
    const slot = str(b.slot) as PhotoSlot;
    if (!(PHOTO_SLOTS as readonly string[]).includes(slot)) return fail('VALIDATION', `slot must be one of ${PHOTO_SLOTS.join(', ')}`, 422);
    const path = `${id}/${slot}`;
    const { data, error } = await db.storage.from('vehicle-photos').createSignedUploadUrl(path, { upsert: true });
    if (error || !data) return fail('STORAGE_ERROR', error?.message ?? 'could not create upload url', 500);
    return ok({ bucket: 'vehicle-photos', path, signed_url: data.signedUrl, token: data.token, column: SLOT_TO_COL[slot] });
  }

  if (sub) return fail('NOT_FOUND', 'No such route', 404);

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
    delete b.eligibility_status; // derived, never stored
    if (Object.keys(b).length === 0) return fail('VALIDATION', 'Nothing to update', 422);
    const { error } = await db.from('vehicles').update(b).eq('id', id);
    if (error) return pgFail(error);
    await maybePromoteToReadyForApproval(db, 'driver', owner.driverId);
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
