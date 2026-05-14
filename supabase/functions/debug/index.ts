/**
 * /debug/* — deliberate-failure endpoints to exercise the exception-handling
 * pipeline end-to-end (frontend → edge function → Sentry). Admin-only (validates
 * the caller's Bearer JWT and requires `users.role === 'admin'`), so it's safe to
 * leave deployed. Instrumented with withTiming; verify_jwt = false (we validate).
 *
 * Routes (at the function root, /functions/v1/debug/...):
 *   GET /debug                    → { routes } — this index
 *   GET /debug/throw              → throws an uncaught error → withTiming reports it to Sentry
 *                                   (tags: source=edge-fn, fn=debug) and returns { code: "INTERNAL" } with status 500
 *   GET /debug/fail?code=CONFLICT → returns a fail(code, …) envelope with a sensible status (no Sentry event)
 *   GET /debug/slow?ms=2000       → sleeps `ms` (max 10000) then returns ok({ slept_ms })
 */
// @ts-expect-error — Deno std, resolved at runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsPreflight, ok, fail } from '../_shared/cors.ts';
import { ERROR_CODES, type ErrorCode } from '../_shared/codes.ts';
import { withTiming } from '../_shared/timing.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { bearer } from '../_shared/auth.ts';

type Db = ReturnType<typeof serviceClient>;

async function adminUser(db: Db, req: Request): Promise<{ id: string } | null> {
  const token = bearer(req);
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: u } = await db.from('users').select('role').eq('id', data.user.id).maybeSingle();
  const role = (u?.role as string | undefined) ?? 'driver';
  return role === 'admin' ? { id: data.user.id } : null;
}

const STATUS_FOR_CODE: Record<string, number> = {
  VALIDATION: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  DB_ERROR: 400,
  INTERNAL: 500,
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const handler = withTiming('debug', async (req: Request): Promise<Response> => {
  const pre = corsPreflight(req);
  if (pre) return pre;

  const db = serviceClient();
  const u = await adminUser(db, req);
  if (!u) return fail(ERROR_CODES.FORBIDDEN, 'Admins only — pass an admin Bearer token', 403);

  const url = new URL(req.url);
  const seg = (url.pathname.split(/\/debug\/?/)[1] ?? '').replace(/\/+$/, '');

  if (!seg) {
    return ok({
      routes: [
        'GET /debug/throw — uncaught error → Sentry (source=edge-fn) + 500 INTERNAL envelope',
        'GET /debug/fail?code=<CODE> — a fail() envelope with a sensible status, no Sentry event',
        'GET /debug/slow?ms=<n> — sleep then 200',
      ],
    });
  }

  if (seg === 'throw') {
    throw new Error('deliberate test error from GET /debug/throw — verifies the edge-fn → Sentry pipeline');
  }

  if (seg === 'fail') {
    const code = (url.searchParams.get('code') ?? 'CONFLICT').toUpperCase();
    const status = STATUS_FOR_CODE[code] ?? 400;
    return fail(code as ErrorCode, `deliberate test failure with code ${code}`, status, { debug: true });
  }

  if (seg === 'slow') {
    const ms = Math.min(10_000, Math.max(0, Number(url.searchParams.get('ms') ?? '1000') || 0));
    await sleep(ms);
    return ok({ slept_ms: ms });
  }

  return fail(ERROR_CODES.NOT_FOUND, `No such debug route: /debug/${seg}`, 404);
});

serve(handler);
