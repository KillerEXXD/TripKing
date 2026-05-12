/**
 * /admin/* — the Administration master-data API (§7).
 *
 * Routes (the `api.tripking.in` gateway maps `/admin/*` here; when invoked
 * directly it's `/functions/v1/admin/*`):
 *   GET    /admin/<list>[?include_inactive=true][&make_id=][&category=]
 *   POST   /admin/<list>                 body = the row's columns (snake_case)
 *   PATCH  /admin/<list>/<id>            partial update (incl. {is_active})
 *   DELETE /admin/<list>/<id>            409 IN_USE if referenced (FK) → "disable instead"
 *   PATCH  /admin/<list>/reorder         body = { ids: [...] } → sets sort_order = (i+1)*10
 *   GET    /admin/app-settings
 *   PUT|PATCH /admin/app-settings        partial update
 *
 * Lists: car-types · fuel-types · vehicle-makes · vehicle-models · seat-options ·
 * cities · languages · review-tags · cancel-reasons.
 *
 * Auth: every mutating call requires the `X-Admin-Key` header to match the
 * `ADMIN_API_KEY` env secret — this is a documented STOPGAP until `public.users`
 * + an auth backend land, at which point it becomes a proper `role=admin` check.
 * Every mutation writes an `admin_audit_log` row. Reads are public (the reference
 * data is public content; the frontend `useAdminConfig` queries it). Instrumented
 * with `withTiming`.
 */
// @ts-expect-error — Deno std, resolved at runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsPreflight, ok, fail } from '../_shared/cors.ts';
import { withTiming } from '../_shared/timing.ts';
import { serviceClient } from '../_shared/supabase.ts';

interface ListCfg {
  table: string;
  pk: string;
  orderBy: string;
  reorderable: boolean;
  filters: string[]; // query params that map directly to `.eq(param, value)`
}
const LISTS: Record<string, ListCfg> = {
  'car-types': { table: 'car_types', pk: 'id', orderBy: 'sort_order', reorderable: true, filters: [] },
  'fuel-types': { table: 'fuel_types', pk: 'id', orderBy: 'sort_order', reorderable: true, filters: [] },
  'vehicle-makes': { table: 'vehicle_makes', pk: 'id', orderBy: 'sort_order', reorderable: true, filters: [] },
  'vehicle-models': { table: 'vehicle_models', pk: 'id', orderBy: 'sort_order', reorderable: true, filters: ['make_id'] },
  'seat-options': { table: 'seat_options', pk: 'value', orderBy: 'value', reorderable: false, filters: [] },
  cities: { table: 'cities', pk: 'id', orderBy: 'sort_order', reorderable: true, filters: [] },
  languages: { table: 'languages', pk: 'code', orderBy: 'display_order', reorderable: true, filters: [] },
  'review-tags': { table: 'review_tags', pk: 'id', orderBy: 'sort_order', reorderable: true, filters: ['category'] },
  'cancel-reasons': { table: 'cancel_reasons', pk: 'id', orderBy: 'sort_order', reorderable: true, filters: ['applies_to'] },
};

type Db = ReturnType<typeof serviceClient>;

function requireAdmin(req: Request): Response | null {
  const expected = Deno.env.get('ADMIN_API_KEY');
  if (!expected) return fail('CONFIG_ERROR', 'ADMIN_API_KEY not configured', 500);
  if (req.headers.get('x-admin-key') !== expected) return fail('FORBIDDEN', 'Admin key required', 403);
  return null;
}

async function audit(db: Db, action: string, entity: string, entityId: string | null, before: unknown, after: unknown): Promise<void> {
  await db.from('admin_audit_log').insert({ action, entity, entity_id: entityId, before_json: before ?? null, after_json: after ?? null });
}

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
  if (error.code === '23503') return fail('IN_USE', `${error.message} — it is referenced; disable it instead of deleting`, 409);
  if (error.code === '23502' || error.code === '23514' || error.code === '22P02') return fail('VALIDATION', error.message, 422);
  return fail('DB_ERROR', error.message, 400);
}

const handler = withTiming('admin', async (req: Request): Promise<Response> => {
  const pre = corsPreflight(req);
  if (pre) return pre;

  // everything after the last `/admin/` segment
  const m = new URL(req.url).pathname.match(/\/admin\/(.+)$/);
  const segments = (m ? m[1] : '').split('/').filter(Boolean);
  const url = new URL(req.url);
  const db = serviceClient();

  // ── /admin/app-settings (singleton) ──────────────────────────────────────
  if (segments[0] === 'app-settings' && segments.length === 1) {
    if (req.method === 'GET') {
      const { data, error } = await db.from('app_settings').select('*').eq('id', 1).single();
      if (error) return fail('DB_ERROR', error.message, 500);
      return ok(data);
    }
    if (req.method === 'PUT' || req.method === 'PATCH') {
      const adminErr = requireAdmin(req);
      if (adminErr) return adminErr;
      const body = await readBody(req);
      const { data: before } = await db.from('app_settings').select('*').eq('id', 1).single();
      const { data, error } = await db.from('app_settings').update(body).eq('id', 1).select('*').single();
      if (error) return pgFail(error);
      await audit(db, 'update', 'app_settings', '1', before, data);
      return ok(data);
    }
    return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed on /admin/app-settings`, 405);
  }

  // ── /admin/<list>... ─────────────────────────────────────────────────────
  const listKey = segments[0] ?? '';
  const cfg = LISTS[listKey];
  if (!cfg) return fail('NOT_FOUND', `Unknown admin resource "${listKey}"`, 404);

  // GET /admin/<list>
  if (segments.length === 1 && req.method === 'GET') {
    let q = db.from(cfg.table).select('*').order(cfg.orderBy);
    if (url.searchParams.get('include_inactive') !== 'true') {
      // every lookup table has is_active EXCEPT none — all do
      q = q.eq('is_active', true);
    }
    for (const f of cfg.filters) {
      const v = url.searchParams.get(f);
      if (v) q = q.eq(f, v);
    }
    const { data, error } = await q;
    if (error) return fail('DB_ERROR', error.message, 500);
    return ok(data ?? []);
  }

  // POST /admin/<list>
  if (segments.length === 1 && req.method === 'POST') {
    const adminErr = requireAdmin(req);
    if (adminErr) return adminErr;
    const body = await readBody(req);
    const { data, error } = await db.from(cfg.table).insert(body).select('*').single();
    if (error) return pgFail(error);
    const id = String((data as Record<string, unknown> | null)?.[cfg.pk] ?? '');
    await audit(db, 'create', cfg.table, id, null, data);
    return ok(data);
  }

  // PATCH /admin/<list>/reorder
  if (segments.length === 2 && segments[1] === 'reorder' && req.method === 'PATCH') {
    if (!cfg.reorderable) return fail('BAD_REQUEST', `${listKey} cannot be reordered`, 400);
    const adminErr = requireAdmin(req);
    if (adminErr) return adminErr;
    const body = await readBody(req);
    const ids = Array.isArray(body.ids) ? body.ids : null;
    if (!ids) return fail('BAD_REQUEST', 'ids array required', 400);
    for (let i = 0; i < ids.length; i++) {
      const { error } = await db.from(cfg.table).update({ [cfg.orderBy]: (i + 1) * 10 }).eq(cfg.pk, ids[i]);
      if (error) return pgFail(error);
    }
    await audit(db, 'reorder', cfg.table, null, null, { ids });
    return ok({ reordered: ids.length });
  }

  // PATCH|PUT|DELETE /admin/<list>/<id>
  if (segments.length === 2) {
    const id = decodeURIComponent(segments[1]);
    if (req.method === 'PATCH' || req.method === 'PUT') {
      const adminErr = requireAdmin(req);
      if (adminErr) return adminErr;
      const body = await readBody(req);
      const { data: before } = await db.from(cfg.table).select('*').eq(cfg.pk, id).maybeSingle();
      if (!before) return fail('NOT_FOUND', `${listKey} "${id}" not found`, 404);
      const { data, error } = await db.from(cfg.table).update(body).eq(cfg.pk, id).select('*').single();
      if (error) return pgFail(error);
      await audit(db, 'update', cfg.table, id, before, data);
      return ok(data);
    }
    if (req.method === 'DELETE') {
      const adminErr = requireAdmin(req);
      if (adminErr) return adminErr;
      const { data: before } = await db.from(cfg.table).select('*').eq(cfg.pk, id).maybeSingle();
      if (!before) return fail('NOT_FOUND', `${listKey} "${id}" not found`, 404);
      const { error } = await db.from(cfg.table).delete().eq(cfg.pk, id);
      if (error) return pgFail(error);
      await audit(db, 'delete', cfg.table, id, before, null);
      return ok({ deleted: id });
    }
    return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed`, 405);
  }

  return fail('NOT_FOUND', 'No such admin route', 404);
});

serve(handler);
