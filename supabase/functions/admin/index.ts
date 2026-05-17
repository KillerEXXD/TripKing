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
 *   GET    /admin/places[?city_id=&provider=&q=&active=true|false&limit=]   (admin) — browse the geocoded places (incl. inactive)
 *   PATCH  /admin/places/<id>            (admin) — { is_active?, city_id?, name?, formatted_address?, state? }
 *   POST   /admin/places/<id>/merge      (admin) — { into } → repoint every *_place_id FK from <id> to <into>, then delete <id> (dedupe)
 *   DELETE /admin/places/<id>            (admin) — 409 IN_USE if referenced (deactivate or merge instead)
 *   GET    /admin/users[?role=&active=true|false&q=&limit=]   (admin) — list accounts (filter by role / active / phone|email|name)
 *   GET    /admin/users/<id>             (admin) — one account
 *   PATCH  /admin/users/<id>             (admin) — { is_active?, role?, display_name?, can_report_bugs?, reason? } — the account-level kill switch + role grant + bug-reporter toggle
 *                                        (is_active=false ⇒ the account can't get a new session — /auth verify-otp & refresh 403; fires an account_status_change notification.
 *                                         Distinct from PATCH /drivers|/agents/<id>/active, which deactivates the marketplace *profile* but still lets the user sign in. You can't deactivate / demote your own account.)
 *
 * Lists: car-types · fuel-types · vehicle-makes · vehicle-models · seat-options ·
 * cities · languages · review-tags · cancel-reasons.
 *
 * Auth: every mutating call requires a Bearer access token whose `users.role === 'admin'`
 * (validated via GoTrue; the actor's id is recorded on each `admin_audit_log` row). Reads
 * are public (the reference data is public content; the frontend `useAdminConfig` queries
 * it). Instrumented with `withTiming`; verify_jwt = false (the function validates).
 * (Until Phase-6 hardening, the `/auth` function lets a dev sign up with role:'admin'; in
 * production admins must be provisioned out-of-band — see docs/SECURITY_REVIEW.md.)
 */
// @ts-expect-error — Deno std, resolved at runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsPreflight, ok, fail } from '../_shared/cors.ts';
import { withTiming } from '../_shared/timing.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { withCache, tagCacheHit, okCached } from '../_shared/withCache.ts';
import { CacheTTL } from '../_shared/cache.ts';
import { sharedCacheInvalidateType } from '../_shared/sharedCache.ts';
import { setCacheControl } from '../_shared/httpCache.ts';
import { purgeCloudflareAsync, purgeUrlsFor } from '../_shared/cloudflarePurge.ts';
import { readBody, pgFail as pgFailShared } from '../_shared/http.ts';

const pgFail = (e: { code?: string; message: string }) => pgFailShared(e, { fkAs: 'IN_USE' });

/**
 * Purge URLs that Cloudflare's Worker may have cached for an admin resource.
 * Free plan can't purge by prefix, so we list the canonical URLs (no-param + the
 * common admin variant). Other querystring combos stale-expire via the 15-min TTL.
 */
function adminPurgeUrls(listKey: string): string[] {
  return purgeUrlsFor([
    `/functions/v1/admin/${listKey}`,
    `/functions/v1/admin/${listKey}?include_inactive=true`,
  ]);
}

// Reference data (MASTER tier) — bump the epoch when the response shape of any /admin/<list>
// or /admin/app-settings response changes; that drops every cached entry cluster-wide without
// a manual purge. (TTL is 15 min; safe even without a bump.)
const CACHE_EPOCH = 'v1';

/** Stable cache key from (listKey, sorted query params). Mirrors how the cache layers in. */
function adminCacheKey(listKey: string, url: URL): string {
  const params: string[] = [];
  for (const [k, v] of Array.from(url.searchParams.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    params.push(`${k}-${v}`);
  }
  const tail = params.length ? `:${params.join(':')}` : '';
  return `admin:${listKey}${tail}:${CACHE_EPOCH}`;
}

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
  // Stage-5 referral admin lists (migration 046)
  'referral-tiers':         { table: 'referral_tiers',         pk: 'id', orderBy: 'sort_order', reorderable: true,  filters: ['applies_to_role'] },
  'fraud-action-rules':     { table: 'fraud_action_rules',     pk: 'id', orderBy: 'sort_order', reorderable: true,  filters: ['flag_type', 'severity'] },
  'notification-templates': { table: 'notification_templates', pk: 'id', orderBy: 'sort_order', reorderable: true,  filters: ['type', 'locale'] },
  // migration 056 — phone allowlist for the in-app Design Previews tile (collects feedback from selected teammates).
  'design-preview-allowlist': { table: 'design_preview_allowlist', pk: 'id', orderBy: 'sort_order', reorderable: true, filters: [] },
};

// Singleton settings tables (single row, id=1) handled by a generic block below.
const SINGLETONS: Record<string, { table: string; adminOnlyRead?: boolean }> = {
  'wallet-settings':   { table: 'wallet_settings' },
  'referral-settings': { table: 'referral_settings' },
  'fraud-settings':    { table: 'fraud_settings', adminOnlyRead: true },
};

type Db = ReturnType<typeof serviceClient>;

/** Validates the Bearer token and requires `users.role === 'admin'`. Returns the admin's id, or an error Response. */
async function requireAdmin(db: Db, req: Request): Promise<{ id: string } | Response> {
  const h = req.headers.get('authorization') ?? req.headers.get('Authorization');
  const token = h && h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return fail('UNAUTHORIZED', 'Sign in as an administrator', 401);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return fail('UNAUTHORIZED', 'Invalid or expired session', 401);
  const { data: u } = await db.from('users').select('id, role').eq('id', data.user.id).maybeSingle();
  if (!u || u.role !== 'admin') return fail('FORBIDDEN', 'Administrator role required', 403);
  return { id: u.id as string };
}

async function audit(db: Db, actorId: string, action: string, entity: string, entityId: string | null, before: unknown, after: unknown): Promise<void> {
  await db.from('admin_audit_log').insert({ actor_user_id: actorId, action, entity, entity_id: entityId, before_json: before ?? null, after_json: after ?? null });
}

const handler = withTiming('admin', async (req: Request): Promise<Response> => {
  const pre = corsPreflight(req);
  if (pre) return pre;

  // everything after the last `/admin/` segment
  const m = new URL(req.url).pathname.match(/\/admin\/(.+)$/);
  const segments = (m ? m[1] : '').split('/').filter(Boolean);
  const url = new URL(req.url);
  const db = serviceClient();

  // ── /admin/<singleton-settings> (Stage 5: wallet-settings, referral-settings, fraud-settings) ──
  if (segments.length === 1 && SINGLETONS[segments[0]]) {
    const cfg = SINGLETONS[segments[0]];
    if (req.method === 'GET') {
      if (cfg.adminOnlyRead) {
        const a = await requireAdmin(db, req);
        if (a instanceof Response) return a;
      }
      const { data, error } = await db.from(cfg.table).select('*').eq('id', 1).single();
      if (error) return fail('DB_ERROR', error.message, 500);
      return ok(data);
    }
    if (req.method === 'PUT' || req.method === 'PATCH') {
      const a = await requireAdmin(db, req);
      if (a instanceof Response) return a;
      const body = await readBody(req);
      const { data: before } = await db.from(cfg.table).select('*').eq('id', 1).single();
      const { data, error } = await db.from(cfg.table).update(body).eq('id', 1).select('*').single();
      if (error) return pgFail(error);
      await audit(db, a.id, 'update', cfg.table, '1', before, data);
      await sharedCacheInvalidateType('admin');
      purgeCloudflareAsync(purgeUrlsFor([`/functions/v1/admin/${segments[0]}`]));
      return ok(data);
    }
    return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed on /admin/${segments[0]}`, 405);
  }

  // ── /admin/referrals (Stage 9; admin-only — list, status, reverse, flags) ──
  if (segments[0] === 'referrals') {
    const a = await requireAdmin(db, req);
    if (a instanceof Response) return a;

    // GET /admin/referrals/flags?resolved=&severity=
    if (segments.length === 2 && segments[1] === 'flags' && req.method === 'GET') {
      let q = db.from('referral_fraud_flags')
        .select('id, referral_link_id, flag_type, severity, auto_detected, action_taken, detail, note, created_at, resolved_at, resolved_by, resolved_note')
        .order('created_at', { ascending: false });
      const resolved = url.searchParams.get('resolved');
      if (resolved === 'true')  q = q.not('resolved_at', 'is', null);
      if (resolved === 'false') q = q.is('resolved_at', null);
      const sev = url.searchParams.get('severity');
      if (sev) q = q.eq('severity', sev);
      const ftype = url.searchParams.get('flag_type');
      if (ftype) q = q.eq('flag_type', ftype);
      const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit') ?? '100')));
      const { data, error } = await q.limit(limit);
      if (error) return fail('DB_ERROR', error.message, 500);
      return ok(data ?? []);
    }

    // PATCH /admin/referrals/flags/<id>  body = { resolved_note?, manual_flag? }
    if (segments.length === 3 && segments[1] === 'flags' && (req.method === 'PATCH' || req.method === 'PUT')) {
      const id = decodeURIComponent(segments[2]);
      const body = await readBody(req);
      const { data: before } = await db.from('referral_fraud_flags').select('*').eq('id', id).maybeSingle();
      if (!before) return fail('NOT_FOUND', `flag ${id} not found`, 404);
      const { data, error } = await db.from('referral_fraud_flags')
        .update({ resolved_at: new Date().toISOString(), resolved_by: a.id, resolved_note: typeof body.resolved_note === 'string' ? body.resolved_note : null })
        .eq('id', id).select('*').single();
      if (error) return pgFail(error);
      await audit(db, a.id, 'resolve', 'referral_fraud_flags', id, before, data);
      return ok(data);
    }

    // POST /admin/referrals/flags  body = { referral_link_id, flag_type, severity, note? }
    if (segments.length === 2 && segments[1] === 'flags' && req.method === 'POST') {
      const body = await readBody(req);
      const linkId = typeof body.referral_link_id === 'string' ? body.referral_link_id : '';
      const ftype  = typeof body.flag_type === 'string' ? body.flag_type : '';
      const sev    = typeof body.severity === 'string' ? body.severity : '';
      if (!linkId || !ftype || !sev) return fail('VALIDATION', 'referral_link_id, flag_type, severity required', 422);
      const { data, error } = await db.from('referral_fraud_flags')
        .insert({ referral_link_id: linkId, flag_type: ftype, severity: sev, auto_detected: false, created_by: a.id, note: typeof body.note === 'string' ? body.note : null })
        .select('*').single();
      if (error) return pgFail(error);
      await audit(db, a.id, 'create', 'referral_fraud_flags', (data as Record<string, unknown>).id as string, null, data);
      return ok(data);
    }

    // GET /admin/referrals?status=&referrer_user_id=&referred_user_id=&q=
    if (segments.length === 1 && req.method === 'GET') {
      let q = db.from('referral_links')
        .select('id, referrer_user_id, referred_user_id, referred_user_role, status, cap_paise, payout_per_trip_paise, qualified_at, cap_reached_at, eligible_paid_trips_count, total_earned_paise, created_at, referrer:users!referrer_user_id(display_name, phone), referred:users!referred_user_id(display_name, phone)')
        .order('created_at', { ascending: false });
      const status = url.searchParams.get('status');
      if (status) q = q.eq('status', status);
      const referrerId = url.searchParams.get('referrer_user_id');
      if (referrerId) q = q.eq('referrer_user_id', referrerId);
      const referredId = url.searchParams.get('referred_user_id');
      if (referredId) q = q.eq('referred_user_id', referredId);
      const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit') ?? '100')));
      const { data, error } = await q.limit(limit);
      if (error) return fail('DB_ERROR', error.message, 500);
      return ok(data ?? []);
    }

    // PATCH /admin/referrals/<link_id>/status  body = { status, note? }
    if (segments.length === 3 && segments[2] === 'status' && (req.method === 'PATCH' || req.method === 'PUT')) {
      const linkId = decodeURIComponent(segments[1]);
      const body = await readBody(req);
      const newStatus = typeof body.status === 'string' ? body.status : '';
      if (!newStatus) return fail('VALIDATION', 'status required', 422);
      const { data: before } = await db.from('referral_links').select('*').eq('id', linkId).maybeSingle();
      if (!before) return fail('NOT_FOUND', `referral link ${linkId} not found`, 404);
      const { data, error } = await db.from('referral_links').update({ status: newStatus }).eq('id', linkId).select('*').single();
      if (error) return pgFail(error);
      await audit(db, a.id, 'set_status', 'referral_links', linkId, before, data);
      return ok(data);
    }

    // POST /admin/referrals/<link_id>/reverse-earnings  body = { note? }
    if (segments.length === 3 && segments[2] === 'reverse-earnings' && req.method === 'POST') {
      const linkId = decodeURIComponent(segments[1]);
      const body = await readBody(req);
      const { data: before } = await db.from('referral_links').select('*').eq('id', linkId).maybeSingle();
      if (!before) return fail('NOT_FOUND', `referral link ${linkId} not found`, 404);
      const { data, error } = await db.rpc('reverse_referral_earnings', { _link_id: linkId, _admin_actor_user_id: a.id, _note: typeof body.note === 'string' ? body.note : 'fraud reversal' });
      if (error) {
        const msg = error.message || '';
        if (msg.includes('NOT_FOUND')) return fail('NOT_FOUND', msg, 404);
        return fail('DB_ERROR', msg, 500);
      }
      const reversed = Number(data ?? 0);
      const { data: after } = await db.from('referral_links').select('*').eq('id', linkId).maybeSingle();
      await audit(db, a.id, 'reverse_earnings', 'referral_links', linkId, before, { ...after, reversed_paise: reversed });
      return ok({ reversed_paise: reversed, link: after });
    }

    return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed on /admin/referrals/${segments.slice(1).join('/')}`, 405);
  }

  // ── PATCH /admin/users/<id>/risk  (Stage 9) ───────────────────────────────
  if (segments[0] === 'users' && segments.length === 3 && segments[2] === 'risk' && (req.method === 'PATCH' || req.method === 'PUT')) {
    const a = await requireAdmin(db, req);
    if (a instanceof Response) return a;
    const id = decodeURIComponent(segments[1]);
    const body = await readBody(req);
    const isHighRisk = body.is_high_risk === true;
    const { data: before } = await db.from('users').select('id, is_high_risk, display_name').eq('id', id).maybeSingle();
    if (!before) return fail('NOT_FOUND', 'user not found', 404);
    const { data, error } = await db.from('users').update({ is_high_risk: isHighRisk }).eq('id', id).select('id, is_high_risk, display_name').single();
    if (error) return pgFail(error);
    await audit(db, a.id, isHighRisk ? 'mark_high_risk' : 'clear_high_risk', 'users', id, before, data);
    return ok(data);
  }

  // ── /admin/withdrawals (Stage 7; admin-only — list + transition queue) ──
  if (segments[0] === 'withdrawals') {
    const a = await requireAdmin(db, req);
    if (a instanceof Response) return a;

    // GET /admin/withdrawals?status=&user_id=
    if (segments.length === 1 && req.method === 'GET') {
      let q = db.from('withdrawals')
        .select('id, user_id, amount_paise, upi_id, status, provider, provider_payout_id, external_txn_ref, rejected_reason, admin_actor_user_id, requested_at, approved_at, paid_at, failed_at, user:users!user_id(display_name, phone, role)')
        .order('requested_at', { ascending: false });
      const status = url.searchParams.get('status');
      if (status) q = q.eq('status', status);
      const userId = url.searchParams.get('user_id');
      if (userId) q = q.eq('user_id', userId);
      const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit') ?? '100')));
      const { data, error } = await q.limit(limit);
      if (error) return fail('DB_ERROR', error.message, 500);
      return ok(data ?? []);
    }

    // PATCH /admin/withdrawals/<id>  body = { outcome, provider_payout_id?, external_txn_ref?, rejected_reason? }
    if (segments.length === 2 && (req.method === 'PATCH' || req.method === 'PUT')) {
      const id = decodeURIComponent(segments[1]);
      const body = await readBody(req);
      const outcome = typeof body.outcome === 'string' ? body.outcome.trim() : '';
      if (!outcome) return fail('VALIDATION', 'outcome required (approved|processing|paid|rejected|cancelled|failed)', 422);

      const { data: before } = await db.from('withdrawals').select('*').eq('id', id).maybeSingle();
      if (!before) return fail('NOT_FOUND', `withdrawal ${id} not found`, 404);

      const { data, error } = await db.rpc('complete_referral_withdrawal', {
        _withdrawal_id: id,
        _outcome: outcome,
        _admin_actor_user_id: a.id,
        _provider_payout_id: typeof body.provider_payout_id === 'string' ? body.provider_payout_id : null,
        _external_txn_ref:   typeof body.external_txn_ref   === 'string' ? body.external_txn_ref   : null,
        _rejected_reason:    typeof body.rejected_reason    === 'string' ? body.rejected_reason    : null,
      });
      if (error) {
        const msg = error.message || '';
        if (msg.includes('NOT_FOUND'))        return fail('NOT_FOUND', msg, 404);
        if (msg.includes('TERMINAL_STATUS'))  return fail('TERMINAL_STATUS', msg, 409);
        if (msg.includes('INVALID_OUTCOME'))  return fail('VALIDATION', msg, 422);
        return fail('DB_ERROR', msg, 500);
      }
      const row = Array.isArray(data) ? data[0] : data;
      await audit(db, a.id, `withdrawal_${outcome}`, 'withdrawals', id, before, row);
      return ok(row);
    }

    return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed on /admin/withdrawals`, 405);
  }

  // ── /admin/wallet/set-balance — admin-only test/ops helper ────────────────
  // Sets a USER's `cash_wallets` sub-balance to a target absolute value by inserting an
  // `adjustment` ledger row with the computed delta. Used by:
  //  (a) e2e tests that need to drain promo → assert insufficient-balance 402 paths
  //  (b) ops corrections when a stuck top-up needs manual balance fixing
  // POST body: { user_id, sub_balance: 'promo'|'cash'|'transferred', target_paise: int>=0 }
  if (segments[0] === 'wallet' && segments[1] === 'set-balance' && req.method === 'POST') {
    const a = await requireAdmin(db, req);
    if (a instanceof Response) return a;
    const body = await readBody(req);
    const userId = typeof body.user_id === 'string' ? body.user_id : '';
    const sub = typeof body.sub_balance === 'string' ? body.sub_balance : '';
    const target = Number(body.target_paise);
    if (!userId) return fail('VALIDATION', 'user_id required', 422);
    if (!['promo', 'cash', 'transferred'].includes(sub)) return fail('VALIDATION', "sub_balance must be 'promo' | 'cash' | 'transferred'", 422);
    if (!Number.isFinite(target) || target < 0) return fail('VALIDATION', 'target_paise must be an integer >= 0', 422);

    // Ensure wallet row exists (lazy create via the existing RPC) and grab the wallet_id.
    const { data: walletId, error: ensureErr } = await db.rpc('ensure_cash_wallet', { _user_id: userId });
    if (ensureErr) return fail('DB_ERROR', ensureErr.message, 500);

    // Read current balance from the view to compute the delta.
    const { data: bal, error: balErr } = await db
      .from('cash_wallet_balances')
      .select('promo_paise, cash_paise, transferred_paise')
      .eq('user_id', userId)
      .maybeSingle();
    if (balErr) return fail('DB_ERROR', balErr.message, 500);
    const currentMap: Record<string, number> = {
      promo: Number(bal?.promo_paise ?? 0),
      cash: Number(bal?.cash_paise ?? 0),
      transferred: Number(bal?.transferred_paise ?? 0),
    };
    const current = currentMap[sub] ?? 0;
    const delta = target - current;
    if (delta === 0) return ok({ wallet_id: walletId, sub_balance: sub, balance_paise: target, note: 'no change' });

    const { data: entry, error: insErr } = await db.from('cash_wallet_ledger').insert({
      wallet_id: walletId,
      entry_type: 'adjustment',
      sub_balance: sub,
      amount_paise: delta,
      note: `admin set-balance by ${a.id}: ${sub} → ${target} paise (was ${current})`,
    }).select('id').single();
    if (insErr) return pgFail(insErr);

    await audit(db, a.id, 'set-balance', 'cash_wallets', String(walletId), { sub, from: current }, { sub, to: target, ledger_entry_id: (entry as { id: string }).id });
    return ok({ wallet_id: walletId, sub_balance: sub, balance_paise: target, ledger_entry_id: (entry as { id: string }).id });
  }

  // ── /admin/app-wallet (Stage 5; admin-only read of platform's accounts receivable) ──
  if (segments[0] === 'app-wallet') {
    const a = await requireAdmin(db, req);
    if (a instanceof Response) return a;
    if (segments.length === 1 && req.method === 'GET') {
      // Summary + recent ledger
      const { data: bal } = await db.from('app_wallet_balance').select('*').single();
      const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit') ?? '100')));
      // join the underlying fee charge for trip + side context
      const { data: rows, error } = await db
        .from('app_wallet_ledger')
        .select(`
          id, entry_type, amount_paise, note, created_at,
          fee:platform_fee_charges!platform_fee_charge_id(id, trip_id, side, payer_user_id, payment_source, status)
        `)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) return fail('DB_ERROR', error.message, 500);
      return ok({ balance: bal ?? { total_paise: 0, lifetime_collected_paise: 0, lifetime_refunded_paise: 0, entries: 0 }, ledger: rows ?? [] });
    }
    return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed on /admin/app-wallet`, 405);
  }

  // ── /admin/app-settings (singleton) ──────────────────────────────────────
  if (segments[0] === 'app-settings' && segments.length === 1) {
    if (req.method === 'GET') {
      const { data, hit } = await withCache<unknown>(
        { key: `admin:app-settings:${CACHE_EPOCH}`, ttl: CacheTTL.LONG, tier: 'shared', cacheType: 'admin', entityKind: 'admin', entityId: 'app-settings' },
        async () => {
          const { data, error } = await db.from('app_settings').select('*').eq('id', 1).single();
          if (error) throw new Error(error.message);
          return data;
        },
      );
      return await okCached(req, data, { hit, ttl: CacheTTL.LONG, scope: 'public' });
    }
    if (req.method === 'PUT' || req.method === 'PATCH') {
      const a = await requireAdmin(db, req);
      if (a instanceof Response) return a;
      const body = await readBody(req);
      const { data: before } = await db.from('app_settings').select('*').eq('id', 1).single();
      const { data, error } = await db.from('app_settings').update(body).eq('id', 1).select('*').single();
      if (error) return pgFail(error);
      await audit(db, a.id, 'update', 'app_settings', '1', before, data);
      // Cache-invalidation: app-settings is part of the admin/master tier; flush all of it.
      await sharedCacheInvalidateType('admin');
      purgeCloudflareAsync(purgeUrlsFor(['/functions/v1/admin/app-settings']));
      return ok(data);
    }
    return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed on /admin/app-settings`, 405);
  }

  // ── /admin/places — curate the geocoded places (browse / edit / merge-dedupe / delete) ──
  if (segments[0] === 'places') {
    const PLACE_WRITABLE = ['is_active', 'city_id', 'name', 'formatted_address', 'state'];
    // GET /admin/places — list/filter (admin sees inactive too)
    if (segments.length === 1 && req.method === 'GET') {
      const a = await requireAdmin(db, req);
      if (a instanceof Response) return a;
      let q = db.from('places').select('*');
      const cityId = url.searchParams.get('city_id');
      if (cityId) q = q.eq('city_id', cityId);
      const provider = url.searchParams.get('provider');
      if (provider) q = q.eq('provider', provider);
      const active = url.searchParams.get('active');
      if (active === 'true') q = q.eq('is_active', true);
      else if (active === 'false') q = q.eq('is_active', false);
      const query = (url.searchParams.get('q') ?? '').trim();
      if (query) q = q.ilike('name', `%${query.replace(/[%,]/g, '')}%`);
      const limit = Number(url.searchParams.get('limit') ?? '100');
      const { data, error } = await q.order('created_at', { ascending: false }).limit(Math.min(Number.isFinite(limit) ? limit : 100, 500));
      if (error) return fail('DB_ERROR', error.message, 500);
      return ok(data ?? []);
    }
    // POST /admin/places/<id>/merge — dedupe: repoint every *_place_id FK from <id> to {into}, delete <id>
    if (segments.length === 3 && segments[2] === 'merge' && req.method === 'POST') {
      const a = await requireAdmin(db, req);
      if (a instanceof Response) return a;
      const loser = decodeURIComponent(segments[1]);
      const body = await readBody(req);
      const winner = typeof body.into === 'string' ? body.into.trim() : '';
      if (!winner) return fail('VALIDATION', '`into` (the place id to keep) is required', 422);
      if (winner === loser) return fail('VALIDATION', 'cannot merge a place into itself', 422);
      const { data: pair } = await db.from('places').select('id').in('id', [loser, winner]);
      if (!pair || pair.length !== 2) return fail('NOT_FOUND', 'one of the two place ids does not exist', 404);
      const { data: before } = await db.from('places').select('*').eq('id', loser).maybeSingle();
      const { data: n, error } = await db.rpc('merge_places', { p_loser: loser, p_winner: winner });
      if (error) return fail('DB_ERROR', error.message, 400);
      await audit(db, a.id, 'merge', 'places', loser, before, { merged_into: winner, fk_rows_repointed: n });
      return ok({ merged: loser, into: winner, fk_rows_repointed: n });
    }
    // PATCH /admin/places/<id> · DELETE /admin/places/<id>
    if (segments.length === 2) {
      const id = decodeURIComponent(segments[1]);
      if (req.method === 'PATCH' || req.method === 'PUT') {
        const a = await requireAdmin(db, req);
        if (a instanceof Response) return a;
        const body = await readBody(req);
        const patch: Record<string, unknown> = {};
        for (const k of PLACE_WRITABLE) if (body[k] !== undefined) patch[k] = body[k];
        if (Object.keys(patch).length === 0) return fail('VALIDATION', `nothing to update — allowed: ${PLACE_WRITABLE.join(', ')}`, 422);
        const { data: before } = await db.from('places').select('*').eq('id', id).maybeSingle();
        if (!before) return fail('NOT_FOUND', `place "${id}" not found`, 404);
        const { data, error } = await db.from('places').update(patch).eq('id', id).select('*').single();
        if (error) return pgFail(error);
        await audit(db, a.id, 'update', 'places', id, before, data);
        return ok(data);
      }
      if (req.method === 'DELETE') {
        const a = await requireAdmin(db, req);
        if (a instanceof Response) return a;
        const { data: before } = await db.from('places').select('*').eq('id', id).maybeSingle();
        if (!before) return fail('NOT_FOUND', `place "${id}" not found`, 404);
        const { error } = await db.from('places').delete().eq('id', id);
        if (error) return pgFail(error); // 23503 → 409 IN_USE (referenced — deactivate or merge instead)
        await audit(db, a.id, 'delete', 'places', id, before, null);
        return ok({ deleted: id });
      }
      return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed on /admin/places/<id>`, 405);
    }
    return fail('NOT_FOUND', 'No such /admin/places route', 404);
  }

  // ── /admin/users — account management (list / view / activate-deactivate / grant role) ──
  // The account-level switch (users.is_active). Distinct from PATCH /drivers|/agents/:id/active,
  // which only deactivates the marketplace *profile* (the user can still sign in & see a banner) —
  // this one stops the account from getting a new session at all (/auth verify-otp & refresh → 403).
  if (segments[0] === 'users') {
    const USER_ROLES = ['driver', 'trip_manager', 'admin'];
    const USER_SELECT = 'id, role, phone, email, display_name, preferred_language, is_active, can_report_bugs, created_at, updated_at';
    if (segments.length === 1 && req.method === 'GET') {
      const a = await requireAdmin(db, req);
      if (a instanceof Response) return a;
      let q = db.from('users').select(USER_SELECT);
      const role = url.searchParams.get('role');
      if (role) q = q.eq('role', role);
      const active = url.searchParams.get('active');
      if (active === 'true') q = q.eq('is_active', true);
      else if (active === 'false') q = q.eq('is_active', false);
      const query = (url.searchParams.get('q') ?? '').trim().replace(/[%,]/g, '');
      if (query) q = q.or(`phone.ilike.%${query}%,email.ilike.%${query}%,display_name.ilike.%${query}%`);
      const limit = Number(url.searchParams.get('limit') ?? '100');
      const { data, error } = await q.order('created_at', { ascending: false }).limit(Math.min(Number.isFinite(limit) ? limit : 100, 500));
      if (error) return fail('DB_ERROR', error.message, 500);
      return ok(data ?? []);
    }
    if (segments.length === 2) {
      const id = decodeURIComponent(segments[1]);
      if (req.method === 'GET') {
        const a = await requireAdmin(db, req);
        if (a instanceof Response) return a;
        const { data, error } = await db.from('users').select(USER_SELECT).eq('id', id).maybeSingle();
        if (error) return fail('DB_ERROR', error.message, 500);
        if (!data) return fail('NOT_FOUND', `user "${id}" not found`, 404);
        return ok(data);
      }
      if (req.method === 'PATCH' || req.method === 'PUT') {
        const a = await requireAdmin(db, req);
        if (a instanceof Response) return a;
        const body = await readBody(req);
        const patch: Record<string, unknown> = {};
        if (typeof body.is_active === 'boolean') patch.is_active = body.is_active;
        if (typeof body.role === 'string') {
          if (!USER_ROLES.includes(body.role)) return fail('VALIDATION', `role must be one of ${USER_ROLES.join(', ')}`, 422);
          patch.role = body.role;
        }
        if (typeof body.display_name === 'string') patch.display_name = body.display_name;
        if (typeof body.can_report_bugs === 'boolean') patch.can_report_bugs = body.can_report_bugs;
        if (Object.keys(patch).length === 0) return fail('VALIDATION', 'nothing to update — allowed: is_active, role, display_name, can_report_bugs', 422);
        // can't lock yourself out
        if (patch.is_active === false && id === a.id) return fail('VALIDATION', 'you cannot deactivate your own account', 422);
        if (patch.role !== undefined && patch.role !== 'admin' && id === a.id) return fail('VALIDATION', 'you cannot remove your own admin role', 422);
        const { data: before } = await db.from('users').select('id, role, phone, email, display_name, is_active, can_report_bugs').eq('id', id).maybeSingle();
        if (!before) return fail('NOT_FOUND', `user "${id}" not found`, 404);
        const { data, error } = await db.from('users').update(patch).eq('id', id).select(USER_SELECT).single();
        if (error) return pgFail(error);
        const reason = (typeof body.reason === 'string' && body.reason.trim()) ? body.reason.trim() : null;
        await audit(db, a.id, 'update', 'users', id, before, { ...data, ...(reason ? { reason } : {}) });
        if (typeof body.is_active === 'boolean' && before.is_active !== body.is_active) {
          await db.from('notifications').insert({
            user_id: id,
            type: 'account_status_change',
            title: body.is_active ? 'Account reactivated' : 'Account suspended',
            body: body.is_active
              ? 'Your account has been reactivated — you can sign in again.'
              : `Your account has been suspended by an administrator.${reason ? ' ' + reason : ''} Contact support if you think this is a mistake.`,
            payload_json: { is_active: body.is_active, kind: 'account', ...(reason ? { reason } : {}) },
          });
        }
        return ok(data);
      }
      return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed on /admin/users/<id>`, 405);
    }
    return fail('NOT_FOUND', 'No such /admin/users route', 404);
  }

  // ── /admin/<list>... ─────────────────────────────────────────────────────
  const listKey = segments[0] ?? '';
  const cfg = LISTS[listKey];
  if (!cfg) return fail('NOT_FOUND', `Unknown admin resource "${listKey}"`, 404);

  // GET /admin/<list> — MASTER tier; cached for 15 min, invalidated on every write below.
  if (segments.length === 1 && req.method === 'GET') {
    const { data, hit } = await withCache<unknown[]>(
      { key: adminCacheKey(listKey, url), ttl: CacheTTL.LONG, tier: 'shared', cacheType: 'admin', entityKind: 'admin', entityId: listKey },
      async () => {
        let q = db.from(cfg.table).select('*').order(cfg.orderBy);
        if (url.searchParams.get('include_inactive') !== 'true') q = q.eq('is_active', true);
        for (const f of cfg.filters) {
          const v = url.searchParams.get(f);
          if (v) q = q.eq(f, v);
        }
        const { data, error } = await q;
        if (error) throw new Error(error.message);
        return data ?? [];
      },
    );
    return await okCached(req, data, { hit, ttl: CacheTTL.LONG, scope: 'public' });
  }

  // POST /admin/<list>
  if (segments.length === 1 && req.method === 'POST') {
    const a = await requireAdmin(db, req);
    if (a instanceof Response) return a;
    const body = await readBody(req);
    const { data, error } = await db.from(cfg.table).insert(body).select('*').single();
    if (error) return pgFail(error);
    const id = String((data as Record<string, unknown> | null)?.[cfg.pk] ?? '');
    await audit(db, a.id, 'create', cfg.table, id, null, data);
    await sharedCacheInvalidateType('admin');
    purgeCloudflareAsync(adminPurgeUrls(listKey));
    return ok(data);
  }

  // PATCH /admin/<list>/reorder
  if (segments.length === 2 && segments[1] === 'reorder' && req.method === 'PATCH') {
    if (!cfg.reorderable) return fail('BAD_REQUEST', `${listKey} cannot be reordered`, 400);
    const a = await requireAdmin(db, req);
    if (a instanceof Response) return a;
    const body = await readBody(req);
    const ids = Array.isArray(body.ids) ? body.ids : null;
    if (!ids) return fail('BAD_REQUEST', 'ids array required', 400);
    for (let i = 0; i < ids.length; i++) {
      const { error } = await db.from(cfg.table).update({ [cfg.orderBy]: (i + 1) * 10 }).eq(cfg.pk, ids[i]);
      if (error) return pgFail(error);
    }
    await audit(db, a.id, 'reorder', cfg.table, null, null, { ids });
    await sharedCacheInvalidateType('admin');
    purgeCloudflareAsync(adminPurgeUrls(listKey));
    return ok({ reordered: ids.length });
  }

  // PATCH|PUT|DELETE /admin/<list>/<id>
  if (segments.length === 2) {
    const id = decodeURIComponent(segments[1]);
    if (req.method === 'PATCH' || req.method === 'PUT') {
      const a = await requireAdmin(db, req);
      if (a instanceof Response) return a;
      const body = await readBody(req);
      const { data: before } = await db.from(cfg.table).select('*').eq(cfg.pk, id).maybeSingle();
      if (!before) return fail('NOT_FOUND', `${listKey} "${id}" not found`, 404);
      const { data, error } = await db.from(cfg.table).update(body).eq(cfg.pk, id).select('*').single();
      if (error) return pgFail(error);
      await audit(db, a.id, 'update', cfg.table, id, before, data);
      await sharedCacheInvalidateType('admin');
      purgeCloudflareAsync(adminPurgeUrls(listKey));
      return ok(data);
    }
    if (req.method === 'DELETE') {
      const a = await requireAdmin(db, req);
      if (a instanceof Response) return a;
      const { data: before } = await db.from(cfg.table).select('*').eq(cfg.pk, id).maybeSingle();
      if (!before) return fail('NOT_FOUND', `${listKey} "${id}" not found`, 404);
      const { error } = await db.from(cfg.table).delete().eq(cfg.pk, id);
      if (error) return pgFail(error);
      await audit(db, a.id, 'delete', cfg.table, id, before, null);
      await sharedCacheInvalidateType('admin');
      purgeCloudflareAsync(adminPurgeUrls(listKey));
      return ok({ deleted: id });
    }
    return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed`, 405);
  }

  return fail('NOT_FOUND', 'No such admin route', 404);
});

serve(handler);
