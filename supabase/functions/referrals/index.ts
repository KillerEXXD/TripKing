/**
 * /referrals/* — read-only referral endpoints for the referrer's own dashboard.
 * Stage 4 of the referral program. Authed (Bearer); instrumented with withTiming.
 *
 * Routes (matched on the path AFTER /referrals):
 *   GET /me                    → summary numbers + last 30 ledger entries + tier snapshot
 *   GET /me/referred           → list of users this caller has referred (joined: name, kyc, link state)
 *                                ?status=earning_active|cap_reached|... + ?role=driver|trip_manager
 *   GET /me/earnings           → per-day rollup of accruals; ?from=YYYY-MM-DD&to=YYYY-MM-DD
 *                                (defaults: last 30 days)
 *   GET /:link_id              → one referred-user drilldown (referrer-only or admin):
 *                                link row + their full ledger entries with trip route
 *
 * Stage 7 (withdrawals) and Stage 6 (transfer-to-cash-wallet) add POST endpoints here.
 */
// @ts-expect-error — Deno std, resolved at runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsPreflight, ok, fail } from '../_shared/cors.ts';
import { withTiming } from '../_shared/timing.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { authUser } from '../_shared/auth.ts';

type Db = ReturnType<typeof serviceClient>;
type Row = Record<string, unknown>;

const LINK_SELECT = `
  id, referrer_user_id, referred_user_id, referred_user_role, status,
  cap_paise, payout_per_trip_paise, qualified_at, cap_reached_at,
  eligible_paid_trips_count, total_earned_paise, created_at, updated_at,
  referred_user:users!referred_user_id(id, display_name, phone, role, referral_code)
`;

async function fetchSummary(db: Db, userId: string): Promise<Row> {
  const { data: bal } = await db.from('referral_balances').select('*').eq('user_id', userId).maybeSingle();
  // counts per link status
  const { data: links } = await db.from('referral_links').select('status').eq('referrer_user_id', userId);
  const counts: Record<string, number> = {};
  for (const r of (links ?? []) as Row[]) {
    const s = String(r.status);
    counts[s] = (counts[s] ?? 0) + 1;
  }
  return {
    lifetime_earned_paise: Number(bal?.lifetime_earned_paise ?? 0),
    reversed_paise:        Number(bal?.reversed_paise ?? 0),
    transferred_paise:     Math.abs(Number(bal?.transferred_paise ?? 0)),
    withdrawn_paise:       Math.abs(Number(bal?.withdrawn_paise ?? 0)),
    net_paise:             Number(bal?.net_paise ?? 0),
    // Stage 7 will tighten "withdrawable" with a hold-period filter; for now
    // it equals the net (lifetime − transfers − withdrawals − reversals).
    withdrawable_paise:    Math.max(0, Number(bal?.net_paise ?? 0)),
    pending_paise:         0,                                    // Stage 7
    counts: {
      total_referred:       Number(bal?.total_referred_count ?? 0),
      earning_active:       Number(bal?.earning_active_count ?? 0),
      cap_reached:          Number(bal?.cap_reached_count ?? 0),
      signed_up:            counts.signed_up ?? 0,
      verification_pending: counts.verification_pending ?? 0,
      verified:             counts.verified ?? 0,
      verification_rejected: counts.verification_rejected ?? 0,
      paid_trips_started:   counts.paid_trips_started ?? 0,
      qualified:            counts.qualified ?? 0,
      suspended:            counts.suspended ?? 0,
      rejected:             counts.rejected ?? 0,
      expired:              counts.expired ?? 0,
    },
  };
}

const handler = withTiming('referrals', async (req: Request): Promise<Response> => {
  const pre = corsPreflight(req);
  if (pre) return pre;

  const url = new URL(req.url);
  const segs = url.pathname.split('/').filter(Boolean);
  const after = segs.slice(segs.indexOf('referrals') + 1);

  // ── POST /me/transfer-to-wallet { amount_paise } — Stage 6 ────────────────
  if (req.method === 'POST' && after.join('/') === 'me/transfer-to-wallet') {
    const db = serviceClient();
    const u = await authUser(db, req);
    if (!u) return fail('UNAUTHORIZED', 'Sign in to transfer your earnings', 401);
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch { /* empty body */ }
    const amount = Number(body.amount_paise);
    if (!Number.isFinite(amount) || amount <= 0) return fail('VALIDATION', 'amount_paise must be > 0', 422);
    const { data, error } = await db.rpc('transfer_referral_to_cash_wallet', { _user_id: u.id, _amount_paise: amount });
    if (error) {
      const msg = error.message || '';
      if (msg.includes('INSUFFICIENT_REFERRAL_BALANCE')) return fail('INSUFFICIENT_REFERRAL_BALANCE', msg, 402);
      if (msg.includes('NO_REFERRALS')) return fail('NO_REFERRALS', 'You have no referral earnings to transfer', 404);
      if (msg.includes('INVALID_AMOUNT')) return fail('VALIDATION', msg, 422);
      return fail('DB_ERROR', msg, 500);
    }
    // .rpc on a TABLE-returning function returns an array of rows
    const row = Array.isArray(data) ? data[0] : data;
    return ok(row);
  }

  if (req.method !== 'GET') return fail('METHOD_NOT_ALLOWED', '', 405);
  // routes:
  //   /me              → ['me']
  //   /me/referred     → ['me', 'referred']
  //   /me/earnings     → ['me', 'earnings']
  //   /:link_id        → [uuid]
  const route = after.join('/');

  const db = serviceClient();
  const u = await authUser(db, req);
  if (!u) return fail('UNAUTHORIZED', 'Sign in to view your referrals', 401);

  // ── GET /me ─────────────────────────────────────────────────────────────
  if (route === 'me') {
    const summary = await fetchSummary(db, u.id);
    // recent ledger across all my links (last 30)
    const { data: links } = await db.from('referral_links').select('id').eq('referrer_user_id', u.id);
    const linkIds = ((links ?? []) as Row[]).map((r) => r.id as string);
    let recentLedger: Row[] = [];
    if (linkIds.length > 0) {
      const { data } = await db.from('referral_ledger')
        .select('id, referral_link_id, entry_type, amount_paise, trip_id, platform_fee_charge_id, note, created_at')
        .in('referral_link_id', linkIds)
        .order('created_at', { ascending: false })
        .limit(30);
      recentLedger = (data ?? []) as Row[];
    }
    return ok({
      user_id: u.id,
      summary,
      recent_ledger: recentLedger,
    });
  }

  // ── GET /me/referred ────────────────────────────────────────────────────
  if (route === 'me/referred') {
    const status = url.searchParams.get('status');
    const role = url.searchParams.get('role');
    let q = db.from('referral_links').select(LINK_SELECT).eq('referrer_user_id', u.id).order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    if (role)   q = q.eq('referred_user_role', role);
    const { data, error } = await q;
    if (error) return fail('DB_ERROR', error.message, 500);
    return ok(data ?? []);
  }

  // ── GET /me/earnings?from=&to= ──────────────────────────────────────────
  if (route === 'me/earnings') {
    const to = url.searchParams.get('to') ?? new Date().toISOString().slice(0, 10);
    const from = url.searchParams.get('from')
      ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const { data: links } = await db.from('referral_links').select('id').eq('referrer_user_id', u.id);
    const linkIds = ((links ?? []) as Row[]).map((r) => r.id as string);
    if (linkIds.length === 0) return ok({ from, to, days: [] });
    const { data, error } = await db.from('referral_ledger')
      .select('amount_paise, trip_id, created_at, entry_type')
      .in('referral_link_id', linkIds)
      .eq('entry_type', 'accrual')
      .gte('created_at', from + 'T00:00:00Z')
      .lt('created_at', to + 'T23:59:59Z');
    if (error) return fail('DB_ERROR', error.message, 500);
    const byDay = new Map<string, { trips: number; paise: number }>();
    for (const row of (data ?? []) as Row[]) {
      const day = String(row.created_at).slice(0, 10);
      const slot = byDay.get(day) ?? { trips: 0, paise: 0 };
      slot.trips += 1;
      slot.paise += Number(row.amount_paise);
      byDay.set(day, slot);
    }
    const days = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, trips: v.trips, paise: v.paise }));
    return ok({ from, to, days });
  }

  // ── GET /:link_id ───────────────────────────────────────────────────────
  if (after.length === 1 && /^[0-9a-f-]{36}$/i.test(after[0])) {
    const linkId = after[0];
    const { data: link, error } = await db.from('referral_links').select(LINK_SELECT).eq('id', linkId).maybeSingle();
    if (error) return fail('DB_ERROR', error.message, 500);
    if (!link) return fail('NOT_FOUND', 'Referral link not found', 404);
    if ((link as Row).referrer_user_id !== u.id && u.role !== 'admin') {
      return fail('FORBIDDEN', 'Not your referral', 403);
    }
    const { data: ledger } = await db.from('referral_ledger')
      .select(`
        id, entry_type, amount_paise, created_at, note,
        trip:trips!trip_id(id, from_city:cities!from_city_id(name), to_city:cities!to_city_id(name)),
        fee:platform_fee_charges!platform_fee_charge_id(id, side, payment_source)
      `)
      .eq('referral_link_id', linkId)
      .order('created_at', { ascending: false });
    return ok({ link, ledger: ledger ?? [] });
  }

  return fail('NOT_FOUND', `Unknown referrals route "${route}"`, 404);
});

serve(handler);
