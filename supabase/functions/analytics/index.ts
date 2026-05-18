/**
 * /analytics/* — server-computed analytics (Phase 5). Thin wrappers over the SQL aggregation
 * functions (`get_admin_dashboard()`, `get_agent_analytics(uuid)`, `get_driver_analytics(uuid)`,
 * `get_api_metrics_summary(int)`); all the counting/summing happens in Postgres. Bearer-required;
 * withTiming; verify_jwt = false.
 *
 *   GET /analytics/admin             (admin; Bearer)               — platform-wide dashboard blob
 *   GET /analytics/agent             (Bearer)                      — the caller's own agent (trip-posting) analytics
 *   GET /analytics/agent?user_id=    (admin, or user_id == caller) — a specific agent's analytics
 *   GET /analytics/driver            (Bearer)                      — the caller's own driver (earnings & history) analytics
 *   GET /analytics/driver?user_id=   (admin, or user_id == caller) — a specific driver's analytics
 *   GET /analytics/api-metrics?hours=24  (admin; Bearer)           — per-endpoint latency/error rollup
 */
// @ts-expect-error — Deno std, resolved at runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsPreflight, ok, fail } from '../_shared/cors.ts';
import { withTiming } from '../_shared/timing.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { withCache, tagCacheHit } from '../_shared/withCache.ts';
import { CacheTTL } from '../_shared/cache.ts';
import { setCacheControl } from '../_shared/httpCache.ts';
import { authUser, isAdmin } from '../_shared/auth.ts';

const CACHE_EPOCH = 'v1';

const handler = withTiming('analytics', async (req: Request): Promise<Response> => {
  const pre = corsPreflight(req);
  if (pre) return pre;
  if (req.method !== 'GET') return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed`, 405);
  const db = serviceClient();
  const url = new URL(req.url);
  const m = url.pathname.match(/\/analytics(?:\/(.+))?$/);
  const resource = (m && m[1] ? m[1] : '').split('/').filter(Boolean)[0]; // 'admin' | 'agent' | 'driver' | 'api-metrics'

  const u = await authUser(db, req);
  if (!u) return fail('UNAUTHORIZED', 'Sign in to view analytics', 401);

  // ── GET /analytics/admin (platform dashboard) ────────────────────────────
  // Heaviest aggregation in the function — shared cache + 5 min TTL is a big win.
  if (resource === 'admin') {
    if (!isAdmin(u)) return fail('FORBIDDEN', 'Admin only', 403);
    const { data, hit } = await withCache<unknown>(
      { key: `analytics:admin:${CACHE_EPOCH}`, ttl: CacheTTL.MEDIUM, tier: 'shared', cacheType: 'analytics', entityKind: 'admin', entityId: 'dashboard' },
      async () => {
        const { data, error } = await db.rpc('get_admin_dashboard');
        if (error) throw new Error(error.message);
        return data;
      },
    );
    // admin dashboard is identical for all admins, but it IS admin-only — keep private to skip CDN.
    return setCacheControl(tagCacheHit(ok(data), hit), { ttl: CacheTTL.MEDIUM, scope: 'private' });
  }

  // ── GET /analytics/agent (own; or ?user_id= for admins) — 60s memory tier ──
  if (resource === 'agent') {
    const target = url.searchParams.get('user_id') ?? u.id;
    if (target !== u.id && !isAdmin(u)) return fail('FORBIDDEN', 'You can only view your own analytics', 403);
    const { data, hit } = await withCache<unknown>(
      // Promoted memory → shared (2026-05-19): per-isolate memory hit-rate was 0% across
      // 440 calls/24h — Deno Deploy churns isolates fast enough that the warmed copy is
      // almost never reused for the same user. Shared tier survives across isolates.
      { key: `analytics:agent:user-${target}:${CACHE_EPOCH}`, ttl: 60, tier: 'shared', cacheType: 'analytics', entityKind: 'analytics', entityId: `agent:${target}` },
      async () => {
        const { data, error } = await db.rpc('get_agent_analytics', { p_user_id: target });
        if (error) throw new Error(error.message);
        return data;
      },
    );
    return setCacheControl(tagCacheHit(ok(data), hit), { ttl: 60, scope: 'private' });
  }

  // ── GET /analytics/driver (own; or ?user_id= for admins) — earnings & history ──
  if (resource === 'driver') {
    const target = url.searchParams.get('user_id') ?? u.id;
    if (target !== u.id && !isAdmin(u)) return fail('FORBIDDEN', 'You can only view your own analytics', 403);
    const { data, hit } = await withCache<unknown>(
      // Promoted memory → shared — same reasoning as /analytics/agent above.
      { key: `analytics:driver:user-${target}:${CACHE_EPOCH}`, ttl: 60, tier: 'shared', cacheType: 'analytics', entityKind: 'analytics', entityId: `driver:${target}` },
      async () => {
        const { data, error } = await db.rpc('get_driver_analytics', { p_user_id: target });
        if (error) throw new Error(error.message);
        return data;
      },
    );
    return setCacheControl(tagCacheHit(ok(data), hit), { ttl: 60, scope: 'private' });
  }

  // ── GET /analytics/api-metrics?hours=24 (per-endpoint latency/error rollup) ──
  if (resource === 'api-metrics') {
    if (!isAdmin(u)) return fail('FORBIDDEN', 'Admin only', 403);
    const raw = parseInt(url.searchParams.get('hours') ?? '24', 10);
    const hours = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 720) : 24;
    const { data, hit } = await withCache<unknown>(
      // Promoted memory → shared (2026-05-19): see /analytics/agent rationale.
      { key: `analytics:api-metrics:hours-${hours}:${CACHE_EPOCH}`, ttl: 60, tier: 'shared', cacheType: 'analytics', entityKind: 'analytics', entityId: `api-metrics:${hours}h` },
      async () => {
        const { data, error } = await db.rpc('get_api_metrics_summary', { p_hours: hours });
        if (error) throw new Error(error.message);
        return data;
      },
    );
    return setCacheControl(tagCacheHit(ok(data), hit), { ttl: 60, scope: 'private' });
  }

  return fail('NOT_FOUND', 'Use /analytics/admin, /analytics/agent, /analytics/driver or /analytics/api-metrics', 404);
});

serve(handler);
