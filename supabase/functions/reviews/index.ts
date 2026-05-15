/**
 * /reviews/* — post-trip ratings (passenger→driver, manager→driver, driver→manager). Published
 * reviews are readable by everyone; the rater and ratee see their own; admins see all. The rater
 * posts (rater_user_id = caller). withTiming; verify_jwt = false — mirrors the migration-003 RLS
 * "reviews read (published | own | admin) / rater insert / admin update+delete" policy. Anonymous
 * passenger reviews (rater_user_id null) are out of scope here — they'd come via a passenger-portal
 * function with the service role.
 *
 *   GET   /reviews              ?trip_id=&ratee_user_id=&direction=&flagged=true&limit=   (optional Bearer; flagged=true = the admin moderation queue)
 *   GET   /reviews/:id          (optional Bearer)
 *   POST  /reviews              (Bearer) — rater_user_id = caller; requires the trip to be completed; unique (trip_id, direction)
 *   POST  /reviews/:id/report   (Bearer; any authed user) — set is_flagged + flag_reason
 *   POST  /reviews/:id/moderate (admin; Bearer) — { is_published?, clear_flag? } — moderation action; sets moderated_by/moderated_at
 */
// @ts-expect-error — Deno std, resolved at runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsPreflight, ok, fail } from '../_shared/cors.ts';
import { withTiming } from '../_shared/timing.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { rateLimitOk } from '../_shared/rateLimit.ts';
import { stripPhones, assertNoPhones, PhoneInTextError } from '../_shared/pii.ts';
import { authUser, isAdmin } from '../_shared/auth.ts';
import { readBody, pgFail as pgFailShared } from '../_shared/http.ts';
import { withCache, tagCacheHit } from '../_shared/withCache.ts';
import { CacheTTL } from '../_shared/cache.ts';
import { sharedCacheInvalidateEntity } from '../_shared/sharedCache.ts';
import { setCacheControl } from '../_shared/httpCache.ts';

// LIVE tier — short TTL, shared cache. Visibility-OR (published | own | admin) is per-caller, so
// the cache key encodes the viewer identity (`admin` / `u:<uid>` / `anon`). Invalidation is coarse:
// any review mutation (create, report, moderate) drops every key under entityKind='review',
// entityId='all'. Reviews are read-heavy and writes are rare (one per trip per direction), so the
// hit-rate ceiling stays high despite the broad invalidation. Bump epoch on response-shape changes.
const CACHE_EPOCH = 'v1';

const pgFail = (e: { code?: string; message: string }) =>
  pgFailShared(e, { dupMessage: 'A review for this trip and direction already exists' });

type Db = ReturnType<typeof serviceClient>;
const DIRECTIONS = ['passenger_to_driver', 'manager_to_driver', 'driver_to_manager'] as const;

const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
}

const handler = withTiming('reviews', async (req: Request): Promise<Response> => {
  const pre = corsPreflight(req);
  if (pre) return pre;
  const db = serviceClient();
  const url = new URL(req.url);
  const m = url.pathname.match(/\/reviews(?:\/(.+))?$/);
  const segs = (m && m[1] ? m[1] : '').split('/').filter(Boolean);
  const id = segs[0];
  const sub = segs[1]; // 'report'

  const u = await authUser(db, req);

  /** Pull `display_handle` off the joined rater user row (if present) and flatten it as `rater_handle`. */
  function shapeReview(row: Record<string, unknown> | null): Record<string, unknown> | null {
    if (!row) return row;
    const out = { ...row };
    const ru = out.rater_user as Record<string, unknown> | null | undefined;
    out.rater_handle = ru && typeof ru.display_handle === 'string' ? ru.display_handle : null;
    delete out.rater_user;
    out.comment = stripPhones(typeof out.comment === 'string' ? out.comment : null) ?? out.comment ?? '';
    return out;
  }
  const REVIEW_SELECT = '*, rater_user:users!rater_user_id(display_handle)';

  async function fullReview(reviewId: string): Promise<Response> {
    const { data, error } = await db.from('reviews').select(REVIEW_SELECT).eq('id', reviewId).maybeSingle();
    if (error) return fail('DB_ERROR', error.message, 500);
    if (!data) return fail('NOT_FOUND', 'Review not found', 404);
    return ok(shapeReview(data as Record<string, unknown>));
  }
  // visibility for SELECTs: admins see all; an authed user sees published rows + their own (rater/ratee); anon sees published only.
  const visibilityOr = isAdmin(u) ? null : u ? `is_published.eq.true,rater_user_id.eq.${u.id},ratee_user_id.eq.${u.id}` : 'is_published.eq.true';
  const viewerKey = isAdmin(u) ? 'admin' : u ? `u:${u.id}` : 'anon';

  // ── GET /reviews (list) — LIVE tier, shared cache (viewer-keyed; coarse invalidation) ────
  if (!id && req.method === 'GET') {
    const tripId = url.searchParams.get('trip_id') ?? '';
    const ratee = url.searchParams.get('ratee_user_id') ?? '';
    const direction = url.searchParams.get('direction') ?? '';
    const flagged = url.searchParams.get('flagged') === 'true' && isAdmin(u);
    const rawLimit = Number(url.searchParams.get('limit') ?? '50');
    const effectiveLimit = Math.min(Number.isFinite(rawLimit) ? rawLimit : 50, 200);
    const cacheKey = `reviews:list:trip-${tripId}:ratee-${ratee}:dir-${direction}:flagged-${flagged}:limit-${effectiveLimit}:viewer-${viewerKey}:${CACHE_EPOCH}`;
    const { data, hit } = await withCache<Record<string, unknown>[]>(
      { key: cacheKey, ttl: CacheTTL.SHORT, tier: 'shared', cacheType: 'live', entityKind: 'review', entityId: 'all' },
      async () => {
        let q = db.from('reviews').select(REVIEW_SELECT);
        if (tripId) q = q.eq('trip_id', tripId);
        if (ratee) q = q.eq('ratee_user_id', ratee);
        if (direction) q = q.eq('direction', direction);
        if (flagged) q = q.eq('is_flagged', true);
        if (visibilityOr) q = q.or(visibilityOr);
        q = q.order('created_at', { ascending: false }).limit(effectiveLimit);
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return (data ?? []).map((r) => shapeReview(r as Record<string, unknown>)) as Record<string, unknown>[];
      },
    );
    return setCacheControl(tagCacheHit(ok(data), hit), { ttl: CacheTTL.SHORT, scope: 'private' });
  }

  // ── POST /reviews (the rater) ────────────────────────────────────────────
  if (!id && req.method === 'POST') {
    if (!u) return fail('UNAUTHORIZED', 'Sign in to leave a review', 401);
    if (!(await rateLimitOk(db, `post-review:${u.id}`, 30, 60))) return fail('RATE_LIMITED', 'Too many reviews — try again shortly', 429);
    // a deactivated driver / agent can't leave reviews — the is_active flag must be honoured everywhere
    if (u.role === 'driver' || u.role === 'trip_manager') {
      const profTable = u.role === 'driver' ? 'drivers' : 'trip_managers';
      const { data: prof } = await db.from(profTable).select('is_active').eq('user_id', u.id).maybeSingle();
      if (prof?.is_active === false) return fail('ACCOUNT_SUSPENDED', 'Your account has been deactivated — contact support.', 403);
    }
    const b = await readBody(req);
    const tripId = strOrNull(b.trip_id);
    const direction = strOrNull(b.direction);
    const score = typeof b.score === 'number' ? b.score : NaN;
    if (!tripId) return fail('VALIDATION', 'trip_id is required', 422);
    if (!direction || !(DIRECTIONS as readonly string[]).includes(direction)) return fail('VALIDATION', `direction must be one of ${DIRECTIONS.join(', ')}`, 422);
    if (!Number.isInteger(score) || score < 1 || score > 5) return fail('VALIDATION', 'score must be an integer 1–5', 422);
    const comment = typeof b.comment === 'string' ? b.comment : '';
    try { assertNoPhones(comment, 'comment'); } catch (e) {
      if (e instanceof PhoneInTextError) return fail('VALIDATION', e.message, 400);
      throw e;
    }

    const { data: trip } = await db.from('trips').select('id, status, posted_by_user_id, assigned_driver_id').eq('id', tripId).maybeSingle();
    if (!trip) return fail('NOT_FOUND', 'Trip not found', 404);
    if (trip.status !== 'completed') return fail('VALIDATION', `Trip is "${trip.status}" — reviews can only be left on completed trips`, 422);

    // derive ratee_user_id if not provided
    let rateeUserId = strOrNull(b.ratee_user_id);
    if (!rateeUserId) {
      if (direction === 'driver_to_manager') {
        rateeUserId = (trip.posted_by_user_id as string) ?? null;
      } else if (trip.assigned_driver_id) {
        const { data: d } = await db.from('drivers').select('user_id').eq('id', trip.assigned_driver_id).maybeSingle();
        rateeUserId = (d?.user_id as string | undefined) ?? null;
      }
    }

    const insert = {
      trip_id: tripId,
      rater_user_id: u.id,
      rater_role: u.role === 'admin' || u.role === 'trip_manager' || u.role === 'driver' ? u.role : 'passenger',
      ratee_user_id: rateeUserId,
      direction,
      score,
      comment,
      tag_ids: strArray(b.tag_ids),
    };
    const { data: created, error } = await db.from('reviews').insert(insert).select('id').single();
    if (error) return pgFail(error);
    await sharedCacheInvalidateEntity('review', 'all');
    if (rateeUserId) {
      // fire-and-forget — don't fail the review if the notification insert does
      await db.from('notifications').insert({
        user_id: rateeUserId,
        type: 'review_received',
        title: 'New review',
        body: `You received a ${score}★ review`,
        payload_json: { review_id: created.id, trip_id: tripId, direction },
      });
    }
    return fullReview(created.id as string);
  }

  if (!id) return fail('NOT_FOUND', 'No such route', 404);

  // ── POST /reviews/:id/report (any authed user) ───────────────────────────
  if (sub === 'report' && req.method === 'POST') {
    if (!u) return fail('UNAUTHORIZED', 'Sign in to report a review', 401);
    const { data: rev } = await db.from('reviews').select('id').eq('id', id).maybeSingle();
    if (!rev) return fail('NOT_FOUND', 'Review not found', 404);
    const b = await readBody(req);
    const { error } = await db.from('reviews').update({ is_flagged: true, flag_reason: strOrNull(b.flag_reason) }).eq('id', id);
    if (error) return pgFail(error);
    await sharedCacheInvalidateEntity('review', 'all');
    return fullReview(id);
  }

  // ── POST /reviews/:id/moderate (admin — the moderation queue action) ─────
  if (sub === 'moderate' && req.method === 'POST') {
    if (!u) return fail('UNAUTHORIZED', '', 401);
    if (!isAdmin(u)) return fail('FORBIDDEN', 'Admin only', 403);
    const { data: rev } = await db.from('reviews').select('id').eq('id', id).maybeSingle();
    if (!rev) return fail('NOT_FOUND', 'Review not found', 404);
    const b = await readBody(req);
    const update: Record<string, unknown> = { moderated_by: u.id, moderated_at: new Date().toISOString() };
    if (typeof b.is_published === 'boolean') update.is_published = b.is_published;
    if (b.clear_flag === true || b.clear_flag === 'true') {
      update.is_flagged = false;
      update.flag_reason = null;
    }
    const { error } = await db.from('reviews').update(update).eq('id', id);
    if (error) return pgFail(error);
    await sharedCacheInvalidateEntity('review', 'all');
    return fullReview(id);
  }

  // ── GET /reviews/:id ─────────────────────────────────────────────────────
  if (!sub && req.method === 'GET') {
    let q = db.from('reviews').select(REVIEW_SELECT).eq('id', id);
    if (visibilityOr) q = q.or(visibilityOr);
    const { data, error } = await q.maybeSingle();
    if (error) return fail('DB_ERROR', error.message, 500);
    if (!data) return fail('NOT_FOUND', 'Review not found', 404);
    return ok(shapeReview(data as Record<string, unknown>));
  }

  return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed`, 405);
});

serve(handler);
