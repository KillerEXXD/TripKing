/**
 * /passengers/* — the passengers directory (admin list + post-trip phone lookup).
 *
 *   GET /passengers              (admin Bearer)
 *                                 ?q=<name or phone substring>&sort=<col[:asc|desc]>&page=&limit=
 *                                 Newest-registered first (first_seen_at DESC) by default; joins
 *                                 referred_by:users!referred_by_user_id(id, display_name, role, phone).
 *
 *   GET /passengers/lookup?phone=<E.164>   (any Bearer — drivers/agents use this from the
 *                                 post-trip form to prefill the passenger name)
 *                                 Returns the passenger row + referred_by, or 404 if none.
 *
 * The frontend turns 404 into `null` (the `lookupPassengerByPhone` service) so the form can
 * distinguish "no match" from "still checking" from "error".
 *
 * Writes happen elsewhere — the `trips` edge function calls public.upsert_passenger_from_trip()
 * on every POST /trips (migration 019). This function is read-only.
 */
// @ts-expect-error — Deno std, resolved at runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsPreflight, ok, fail } from '../_shared/cors.ts';
import { withTiming } from '../_shared/timing.ts';
import { serviceClient } from '../_shared/supabase.ts';

type Db = ReturnType<typeof serviceClient>;
type Row = Record<string, unknown>;

const PASSENGER_SELECT =
  'id, phone, name, aliases, referred_by_user_id, first_trip_id, first_seen_at, trips_count, created_at, updated_at, ' +
  'referred_by:users!referred_by_user_id(id, display_name, role, phone)';

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

const handler = withTiming('passengers', async (req: Request): Promise<Response> => {
  const pre = corsPreflight(req);
  if (pre) return pre;
  const db = serviceClient();
  const url = new URL(req.url);
  const m = url.pathname.match(/\/passengers(?:\/(.+))?$/);
  const segs = (m && m[1] ? m[1] : '').split('/').filter(Boolean);
  const head = segs[0];

  // ── GET /passengers/lookup?phone=<E.164> (any signed-in user) ────────────
  if (head === 'lookup' && req.method === 'GET') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', 'Sign in to look up passengers', 401);
    const phone = (url.searchParams.get('phone') ?? '').trim();
    if (!phone) return fail('VALIDATION', 'phone is required', 422);
    const { data, error } = await db.from('passengers').select(PASSENGER_SELECT).eq('phone', phone).maybeSingle();
    if (error) return fail('DB_ERROR', error.message, 500);
    if (!data) return fail('NOT_FOUND', 'No passenger registered under that phone', 404);
    return ok(data);
  }

  // ── GET /passengers (admin list) ─────────────────────────────────────────
  if (!head && req.method === 'GET') {
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', 'Sign in to view the passengers directory', 401);
    if (!isAdmin(u)) return fail('FORBIDDEN', 'Admin only', 403);

    const q = (url.searchParams.get('q') ?? '').trim();
    const sortRaw = (url.searchParams.get('sort') ?? '').trim();
    const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);
    const limitRaw = Number(url.searchParams.get('limit') ?? '50');
    const limit = Math.min(Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 50), 200);
    const offset = (page - 1) * limit;

    let query = db.from('passengers').select(PASSENGER_SELECT, { count: 'exact' });
    if (q) {
      const like = `%${q.replace(/%/g, '\\%')}%`;
      query = query.or(`name.ilike.${like},phone.ilike.${like}`);
    }
    // sort: <col>[:asc|desc] — whitelist columns we expose
    const SORT_COLS = new Set(['first_seen_at', 'updated_at', 'trips_count', 'name', 'phone']);
    let sortCol = 'first_seen_at';
    let asc = false;
    if (sortRaw) {
      const [col, dir] = sortRaw.split(':');
      if (col && SORT_COLS.has(col)) {
        sortCol = col;
        asc = (dir ?? 'desc').toLowerCase() === 'asc';
      }
    }
    query = query.order(sortCol, { ascending: asc }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) return fail('DB_ERROR', error.message, 500);
    const total = count ?? (data?.length ?? 0);
    const pages = Math.max(1, Math.ceil(total / limit));
    const rows = (data ?? []) as Row[];
    return ok(rows, { page, limit, total, pages, has_more: offset + rows.length < total });
  }

  return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed on this route`, 405);
});

serve(handler);
