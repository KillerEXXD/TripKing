/**
 * /analytics/* — server-computed analytics (Phase 5). Thin wrappers over the SQL aggregation
 * functions in migration 004 (`get_admin_dashboard()`, `get_agent_analytics(uuid)`); all the
 * counting/summing happens in Postgres. Bearer-required; withTiming; verify_jwt = false.
 *
 *   GET /analytics/admin             (admin; Bearer)               — platform-wide dashboard blob
 *   GET /analytics/agent             (Bearer)                      — the caller's own agent analytics
 *   GET /analytics/agent?user_id=    (admin, or user_id == caller) — a specific agent's analytics
 *   GET /analytics/api-metrics?hours=24  (admin; Bearer)           — per-endpoint latency/error rollup
 */
// @ts-expect-error — Deno std, resolved at runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsPreflight, ok, fail } from '../_shared/cors.ts';
import { withTiming } from '../_shared/timing.ts';
import { serviceClient } from '../_shared/supabase.ts';

type Db = ReturnType<typeof serviceClient>;

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

const handler = withTiming('analytics', async (req: Request): Promise<Response> => {
  const pre = corsPreflight(req);
  if (pre) return pre;
  if (req.method !== 'GET') return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed`, 405);
  const db = serviceClient();
  const url = new URL(req.url);
  const m = url.pathname.match(/\/analytics(?:\/(.+))?$/);
  const resource = (m && m[1] ? m[1] : '').split('/').filter(Boolean)[0]; // 'admin' | 'agent' | 'api-metrics'

  const u = await authUser(db, req);
  if (!u) return fail('UNAUTHORIZED', 'Sign in to view analytics', 401);

  // ── GET /analytics/admin (platform dashboard) ────────────────────────────
  if (resource === 'admin') {
    if (!isAdmin(u)) return fail('FORBIDDEN', 'Admin only', 403);
    const { data, error } = await db.rpc('get_admin_dashboard');
    if (error) return fail('DB_ERROR', error.message, 500);
    return ok(data);
  }

  // ── GET /analytics/agent (own; or ?user_id= for admins) ──────────────────
  if (resource === 'agent') {
    const target = url.searchParams.get('user_id') ?? u.id;
    if (target !== u.id && !isAdmin(u)) return fail('FORBIDDEN', 'You can only view your own analytics', 403);
    const { data, error } = await db.rpc('get_agent_analytics', { p_user_id: target });
    if (error) return fail('DB_ERROR', error.message, 500);
    return ok(data);
  }

  // ── GET /analytics/api-metrics?hours=24 (per-endpoint latency/error rollup) ──
  if (resource === 'api-metrics') {
    if (!isAdmin(u)) return fail('FORBIDDEN', 'Admin only', 403);
    const raw = parseInt(url.searchParams.get('hours') ?? '24', 10);
    const hours = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 720) : 24;
    const { data, error } = await db.rpc('get_api_metrics_summary', { p_hours: hours });
    if (error) return fail('DB_ERROR', error.message, 500);
    return ok(data);
  }

  return fail('NOT_FOUND', 'Use /analytics/admin, /analytics/agent or /analytics/api-metrics', 404);
});

serve(handler);
