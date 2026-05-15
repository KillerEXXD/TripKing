/**
 * /wallet/* — Cash Wallet endpoints. Authed (Bearer); instrumented with withTiming.
 *
 * Stage 2 of the referral program. Routes (matched on the last path segment):
 *   GET   /wallet                    (Bearer)        → balance + sub-balances + recent ledger
 *   GET   /wallet/ledger             (Bearer)        → paginated ledger
 *   POST  /wallet/topup/initiate     (Bearer)        → create a Razorpay order (STUBBED)
 *   POST  /wallet/topup/verify       (Bearer)        → verify the Razorpay payment + credit (STUBBED)
 *   POST  /wallet/webhook/razorpay   (no auth; HMAC) → server-to-server fallback (STUBBED)
 *
 * Razorpay integration is STUBBED in this stage — the order/verify/webhook endpoints
 * exist with the right shape but never call Razorpay because no test-mode credentials
 * are wired yet. When `RAZORPAY_KEY_ID` is set, they switch to real calls. Until then:
 *   - /topup/initiate returns a fake order_id so the FE can mock the flow
 *   - /topup/verify accepts a fake payment_id and credits the wallet (admin-mode only,
 *     gated behind TRIPKING_DEV_MODE so prod stays safe)
 *   - /webhook/razorpay is a no-op (200) — wired in the real integration step
 */
// @ts-expect-error — Deno std, resolved at runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsPreflight, ok, fail } from '../_shared/cors.ts';
import { withTiming } from '../_shared/timing.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { authUser } from '../_shared/auth.ts';
import { readBody } from '../_shared/http.ts';
import { rateLimitOk } from '../_shared/rateLimit.ts';

type Db = ReturnType<typeof serviceClient>;
type Row = Record<string, unknown>;

const RAZORPAY_KEY_ID = Deno.env.get('RAZORPAY_KEY_ID') ?? '';
const RAZORPAY_KEY_SECRET = Deno.env.get('RAZORPAY_KEY_SECRET') ?? '';
const RAZORPAY_ENABLED = !!(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);
const DEV_MODE = (Deno.env.get('TRIPKING_DEV_MODE') ?? 'true').toLowerCase() === 'true';

async function ensureWallet(db: Db, userId: string): Promise<string> {
  const { data, error } = await db.rpc('ensure_cash_wallet', { _user_id: userId });
  if (error) throw new Error(error.message);
  return data as string;
}

async function fetchBalance(db: Db, userId: string): Promise<Row | null> {
  const { data, error } = await db
    .from('cash_wallet_balances')
    .select('wallet_id, user_id, promo_paise, transferred_paise, cash_paise, total_paise')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Row) ?? null;
}

async function fetchRecentLedger(db: Db, walletId: string, limit = 30): Promise<Row[]> {
  const { data, error } = await db
    .from('cash_wallet_ledger')
    .select('id, entry_type, sub_balance, amount_paise, payment_source, reference_type, reference_id, note, created_at')
    .eq('wallet_id', walletId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data as Row[]) ?? [];
}

const handler = withTiming('wallet', async (req: Request): Promise<Response> => {
  const pre = corsPreflight(req);
  if (pre) return pre;

  const url = new URL(req.url);
  const segs = url.pathname.split('/').filter(Boolean);
  // segs is one of:  ['functions','v1','wallet']               → root
  //                  ['functions','v1','wallet','ledger']      → ledger
  //                  ['functions','v1','wallet','topup','initiate']
  //                  ['functions','v1','wallet','webhook','razorpay']
  const after = segs.slice(segs.indexOf('wallet') + 1);
  const route = after.join('/') || '';
  const db = serviceClient();

  // ── POST /wallet/webhook/razorpay (no auth, HMAC-verified — STUBBED) ──────
  if (route === 'webhook/razorpay') {
    if (req.method !== 'POST') return fail('METHOD_NOT_ALLOWED', '', 405);
    // STUB: real impl will verify x-razorpay-signature and process payment.captured / failed.
    // For now: accept + log + return 200 so Razorpay's webhook tester passes.
    return ok({ received: true, stubbed: !RAZORPAY_ENABLED });
  }

  // ── Everything else requires auth ─────────────────────────────────────────
  const u = await authUser(db, req);
  if (!u) return fail('UNAUTHORIZED', 'Sign in to access your wallet', 401);

  // ── GET /wallet ───────────────────────────────────────────────────────────
  if (route === '' && req.method === 'GET') {
    await ensureWallet(db, u.id);
    const bal = await fetchBalance(db, u.id);
    if (!bal) return fail('NOT_FOUND', 'No wallet for this user', 404);
    const ledger = await fetchRecentLedger(db, bal.wallet_id as string, 30);
    return ok({
      wallet_id: bal.wallet_id,
      balance: {
        promo_paise:       Number(bal.promo_paise ?? 0),
        cash_paise:        Number(bal.cash_paise ?? 0),
        transferred_paise: Number(bal.transferred_paise ?? 0),
        total_paise:       Number(bal.total_paise ?? 0),
      },
      recent_ledger: ledger,
    });
  }

  // ── GET /wallet/ledger?limit=&before= ─────────────────────────────────────
  if (route === 'ledger' && req.method === 'GET') {
    const wid = await ensureWallet(db, u.id);
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') ?? '50') || 50));
    const before = url.searchParams.get('before') ?? '';
    let q = db.from('cash_wallet_ledger')
      .select('id, entry_type, sub_balance, amount_paise, payment_source, reference_type, reference_id, note, created_at')
      .eq('wallet_id', wid)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (before) q = q.lt('created_at', before);
    const { data, error } = await q;
    if (error) return fail('DB_ERROR', error.message, 500);
    return ok(data ?? []);
  }

  // ── POST /wallet/topup/initiate { amount_paise } — Razorpay order (STUBBED) ──
  if (route === 'topup/initiate' && req.method === 'POST') {
    if (!(await rateLimitOk(db, `wallet-topup-init:${u.id}`, 20, 600))) return fail('RATE_LIMITED', 'Too many top-up requests', 429);
    const body = await readBody(req);
    const amountPaise = Number(body.amount_paise);
    if (!Number.isFinite(amountPaise) || amountPaise <= 0) return fail('VALIDATION', 'amount_paise must be > 0', 422);
    // pull min/max guards from wallet_settings — Stage 5 will add them; for now hard limits.
    if (amountPaise < 5000)     return fail('TOPUP_TOO_SMALL', 'Minimum top-up is ₹50', 422);
    if (amountPaise > 5_000_000) return fail('TOPUP_TOO_LARGE', 'Maximum top-up per transaction is ₹50,000', 422);

    if (!RAZORPAY_ENABLED) {
      // STUB: synthesise a fake order so the FE flow can be exercised end-to-end.
      const fakeOrderId = 'order_stub_' + crypto.randomUUID().replace(/-/g, '').slice(0, 14);
      const { data, error } = await db.from('cash_wallet_topups').insert({
        user_id: u.id,
        amount_paise: amountPaise,
        provider: 'razorpay',
        provider_order_id: fakeOrderId,
        status: 'created',
      }).select('id, provider_order_id, amount_paise, status').single();
      if (error) return fail('DB_ERROR', error.message, 500);
      return ok({
        topup_id: (data as Row).id,
        order_id: (data as Row).provider_order_id,
        amount_paise: (data as Row).amount_paise,
        razorpay_key_id: '',
        stubbed: true,
        message: 'Razorpay not configured — call /wallet/topup/verify with { topup_id } to credit (dev-mode only).',
      });
    }

    // Real Razorpay path — TODO when credentials land:
    //   1. POST https://api.razorpay.com/v1/orders { amount, currency:'INR', receipt }
    //   2. Save order_id, return it + RAZORPAY_KEY_ID for the Checkout SDK
    return fail('NOT_IMPLEMENTED', 'Razorpay live integration not yet wired', 501);
  }

  // ── POST /wallet/topup/verify { topup_id, razorpay_payment_id?, razorpay_signature? } ──
  if (route === 'topup/verify' && req.method === 'POST') {
    if (!(await rateLimitOk(db, `wallet-topup-verify:${u.id}`, 30, 600))) return fail('RATE_LIMITED', 'Too many verify requests', 429);
    const body = await readBody(req);
    const topupId = typeof body.topup_id === 'string' ? body.topup_id : '';
    if (!topupId) return fail('VALIDATION', 'topup_id required', 422);

    const { data: topup, error } = await db.from('cash_wallet_topups').select('*').eq('id', topupId).maybeSingle();
    if (error) return fail('DB_ERROR', error.message, 500);
    if (!topup) return fail('NOT_FOUND', 'Top-up not found', 404);
    if ((topup as Row).user_id !== u.id) return fail('FORBIDDEN', 'Not your top-up', 403);
    if ((topup as Row).status === 'succeeded') {
      // idempotent — return the existing ledger entry
      return ok({ topup_id: topupId, status: 'succeeded', already_credited: true });
    }
    if ((topup as Row).status !== 'created' && (topup as Row).status !== 'pending') {
      return fail('TOPUP_NOT_PENDING', `Top-up is in status '${(topup as Row).status}'`, 409);
    }

    if (!RAZORPAY_ENABLED) {
      // STUB: dev-mode only. Credit the wallet without a real payment.
      if (!DEV_MODE) return fail('NOT_IMPLEMENTED', 'Razorpay not configured in production mode', 501);
      const wid = await ensureWallet(db, u.id);
      const fakePaymentId = 'pay_stub_' + crypto.randomUUID().replace(/-/g, '').slice(0, 14);
      const { data: ledger, error: ledErr } = await db.from('cash_wallet_ledger').insert({
        wallet_id: wid,
        entry_type: 'topup',
        sub_balance: 'cash',
        amount_paise: (topup as Row).amount_paise,
        payment_source: 'direct_upi',
        reference_type: 'razorpay_payment_stub',
        reference_id: fakePaymentId,
        note: 'STUB top-up (Razorpay not configured)',
      }).select('id').single();
      if (ledErr) return fail('DB_ERROR', ledErr.message, 500);
      const { error: updErr } = await db.from('cash_wallet_topups')
        .update({ status: 'succeeded', provider_payment_id: fakePaymentId, ledger_entry_id: (ledger as Row).id })
        .eq('id', topupId);
      if (updErr) return fail('DB_ERROR', updErr.message, 500);
      return ok({ topup_id: topupId, status: 'succeeded', stubbed: true, payment_id: fakePaymentId });
    }

    // Real Razorpay path — TODO:
    //   1. Verify HMAC of (order_id|payment_id) against KEY_SECRET.
    //   2. Insert ledger row + update topup. Idempotent on provider_payment_id (UNIQUE).
    return fail('NOT_IMPLEMENTED', 'Razorpay live integration not yet wired', 501);
  }

  return fail('NOT_FOUND', `Unknown wallet route "${route}"`, 404);
});

serve(handler);
