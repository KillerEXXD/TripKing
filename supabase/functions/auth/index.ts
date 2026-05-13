/**
 * /auth/* — phone-OTP authentication. Public (no JWT gate); instrumented with withTiming.
 *
 * Routes (matched on the last path segment, so it works whether invoked as
 * /functions/v1/auth/<x> or proxied as /auth/<x> or /<x>):
 *   POST /auth/request-otp  { phone }                     → { sent: true, dev_otp? }
 *   POST /auth/verify-otp   { phone, otp, display_name?, role? }
 *                                                          → { user, access_token, refresh_token }  (403 ACCOUNT_SUSPENDED if users.is_active = false)
 *   POST /auth/refresh      { refresh_token }              → { user?, access_token, refresh_token }  (403 ACCOUNT_SUSPENDED if users.is_active = false)
 *   POST /auth/logout       (Bearer access_token)          → { ok: true }
 *   GET  /me  (or /auth/me) (Bearer access_token)          → the public.users row
 *
 * DEV-OTP MODE (no SMS provider configured yet): `request-otp` is a no-op placeholder that always
 * succeeds and returns the dev OTP in the response (so the client can auto-fill it); `verify-otp`
 * accepts the dev OTP `12345` (the default) or any 4–6 digit code. The session itself is real —
 * verify-otp find-or-creates the auth user for the phone (with a server-derived password the client
 * never sees) and `signInWithPassword` mints a genuine Supabase session, so `auth.uid()` works in RLS.
 * TODO(real SMS): wire MSG91/Twilio + an `auth_otps` table — `request-otp` then sends a real code and
 * stores its hash; `verify-otp` checks it; stop returning `dev_otp`; gate `role:'admin'` for prod.
 */
// @ts-expect-error — Deno std, resolved at runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsPreflight, ok, fail } from '../_shared/cors.ts';
import { withTiming } from '../_shared/timing.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { rateLimitOk } from '../_shared/rateLimit.ts';

const DEV_OTP = '12345'; // PLACEHOLDER default until a real SMS provider is wired (see TODO above)
type Db = ReturnType<typeof serviceClient>;

const digits = (phone: string) => phone.replace(/[^\d]/g, '');
/** Synthetic email for the Supabase auth user (the project's email provider is on; phone provider may be off). */
const syntheticEmail = (phone: string) => `tk_${digits(phone)}@phone.tripking.local`;

/** A stable, server-only password for a phone — derived from the service-role key (never exposed). */
async function derivedPassword(phone: string): Promise<string> {
  const pepper = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? 'tripking-dev';
  const bytes = new TextEncoder().encode(`tk:${digits(phone)}:${pepper}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return 'p_' + Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const b = await req.json();
    return b && typeof b === 'object' ? (b as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') ?? req.headers.get('Authorization');
  return h && h.startsWith('Bearer ') ? h.slice(7) : null;
}

async function findAuthUserForPhone(db: Db, phone: string): Promise<{ id: string } | null> {
  const email = syntheticEmail(phone);
  // GoTrue admin listUsers — fine for this project's scale.
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = data?.users?.find((x: { email?: string | null }) => (x.email ?? '').toLowerCase() === email);
  return u ? { id: u.id } : null;
}

async function publicUser(db: Db, id: string) {
  const { data, error } = await db.from('users').select('id, role, phone, email, display_name, preferred_language, is_active').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

const handler = withTiming('auth', async (req: Request): Promise<Response> => {
  const pre = corsPreflight(req);
  if (pre) return pre;

  const seg = new URL(req.url).pathname.split('/').filter(Boolean).pop() ?? '';
  const db = serviceClient();

  // ── GET /me ──────────────────────────────────────────────────────────────
  if (seg === 'me') {
    if (req.method !== 'GET') return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed on /me`, 405);
    const token = bearer(req);
    if (!token) return fail('UNAUTHORIZED', 'Bearer token required', 401);
    const { data, error } = await db.auth.getUser(token);
    if (error || !data?.user) return fail('UNAUTHORIZED', 'Invalid or expired token', 401);
    const u = await publicUser(db, data.user.id);
    if (!u) return fail('NOT_FOUND', 'No profile for this user', 404);
    return ok(u);
  }

  if (req.method !== 'POST') return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed`, 405);
  const body = await readBody(req);

  // ── POST /auth/request-otp ───────────────────────────────────────────────
  if (seg === 'request-otp') {
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    if (!phone) return fail('VALIDATION', 'phone required', 422);
    // PLACEHOLDER — no SMS provider wired yet. This endpoint always succeeds (never throws); it
    // returns the dev OTP so the client can auto-fill it. TODO(real SMS): generate a code, store its
    // hash in `auth_otps`, send via MSG91/Twilio, and stop returning `dev_otp`.
    return ok({ sent: true, dev_otp: DEV_OTP });
  }

  // ── POST /auth/verify-otp ────────────────────────────────────────────────
  if (seg === 'verify-otp') {
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const otp = typeof body.otp === 'string' ? body.otp.trim() : '';
    if (!phone || !otp) return fail('VALIDATION', 'phone and otp required', 422);
    // brute-force guard — at most 20 verify attempts per phone per 10 minutes (fail-open on a limiter glitch)
    if (!(await rateLimitOk(db, `verify-otp:${digits(phone)}`, 20, 600))) return fail('RATE_LIMITED', 'Too many attempts — try again in a few minutes', 429);
    // DEV/PLACEHOLDER: accept the dev OTP `12345` (the default) or any 4–6 digit code. TODO(real SMS):
    // verify against the hash stored by request-otp in `auth_otps` (and expire it).
    if (otp !== DEV_OTP && !/^\d{4,6}$/.test(otp)) return fail('INVALID_OTP', 'Incorrect or expired OTP', 401);

    const password = await derivedPassword(phone);
    const email = syntheticEmail(phone);
    const displayName = typeof body.display_name === 'string' ? body.display_name : '';
    const role = body.role === 'driver' || body.role === 'trip_manager' || body.role === 'admin' ? body.role : 'driver';

    let userId: string;
    const existing = await findAuthUserForPhone(db, phone);
    if (existing) {
      userId = existing.id;
      // ensure the password matches our derivation (lets the user sign in)
      await db.auth.admin.updateUserById(userId, { password });
    } else {
      const { data, error } = await db.auth.admin.createUser({
        email,
        email_confirm: true,
        password,
        user_metadata: { display_name: displayName, role, phone },
      });
      if (error || !data?.user) return fail('SIGNUP_FAILED', error?.message ?? 'Could not create user', 400);
      userId = data.user.id;
    }

    const { data: signIn, error: signInErr } = await db.auth.signInWithPassword({ email, password });
    if (signInErr || !signIn?.session) return fail('SIGNIN_FAILED', signInErr?.message ?? 'Could not start session', 400);

    // ensure a public.users row exists. For a NEW user, seed phone/display_name/role (the
    // handle_new_user trigger usually does this from user_metadata; this is a safety net). For an
    // EXISTING user, DON'T clobber their role/display_name on sign-in — role changes go through
    // POST /drivers|/agents (or an admin grant), not by re-authenticating.
    if (existing) {
      await db.from('users').upsert({ id: userId, phone }, { onConflict: 'id', ignoreDuplicates: true });
    } else {
      await db.from('users').upsert(
        { id: userId, phone, display_name: displayName || undefined, role },
        { onConflict: 'id', ignoreDuplicates: false },
      );
    }
    const u = await publicUser(db, userId);
    // account-level kill switch — a suspended user can't get a session (orthogonal to KYC; flipped by an admin)
    if (u && (u as Record<string, unknown>).is_active === false) {
      return fail('ACCOUNT_SUSPENDED', 'This account has been suspended. Please contact support.', 403);
    }

    return ok({ user: u, access_token: signIn.session.access_token, refresh_token: signIn.session.refresh_token });
  }

  // ── POST /auth/refresh ───────────────────────────────────────────────────
  if (seg === 'refresh') {
    const refreshToken = typeof body.refresh_token === 'string' ? body.refresh_token : '';
    if (!refreshToken) return fail('VALIDATION', 'refresh_token required', 422);
    const { data, error } = await db.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data?.session) return fail('INVALID_REFRESH', error?.message ?? 'Could not refresh session', 401);
    const u = data.session.user ? await publicUser(db, data.session.user.id) : null;
    // a suspended account loses access on its next refresh
    if (u && (u as Record<string, unknown>).is_active === false) {
      return fail('ACCOUNT_SUSPENDED', 'This account has been suspended. Please contact support.', 403);
    }
    return ok({ user: u, access_token: data.session.access_token, refresh_token: data.session.refresh_token });
  }

  // ── POST /auth/logout ────────────────────────────────────────────────────
  if (seg === 'logout') {
    const token = bearer(req);
    if (token) {
      try {
        await db.auth.admin.signOut(token);
      } catch {
        /* best-effort */
      }
    }
    return ok({ ok: true });
  }

  return fail('NOT_FOUND', `Unknown auth route "${seg}"`, 404);
});

serve(handler);
