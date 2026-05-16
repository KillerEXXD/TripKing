/**
 * /webhook-qase — receives Qase webhook events (defect.created, defect.updated, defect.resolved)
 * and mirrors them into the internal `bug_reports` table. See docs/QASE_BUG_PIPELINE.md.
 *
 * Auth: HMAC-SHA256 of the raw request body with `QASE_WEBHOOK_SECRET`. Qase sends the digest
 * in the `X-Qase-Signature` header. No Bearer — Qase is a server-to-server caller.
 *
 * The actual upsert + notification fan-out lives in `_shared/qaseDefectIngest.ts`, which is
 * also called by `cron-qase-poll` (the polling fallback when the Qase plan doesn't ship
 * webhooks). Both intake paths land identical rows.
 *
 * Routes (at the function root, i.e. /functions/v1/webhook-qase):
 *   POST /webhook-qase          (HMAC) — `event` ∈ {'defect.created','defect.updated','defect.resolved'}
 *   GET  /webhook-qase/health   (public; no signature) — for Qase's "test webhook" UI
 */
// @ts-expect-error — Deno std
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsPreflight, ok, fail } from '../_shared/cors.ts';
import { withTiming } from '../_shared/timing.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { pgFail } from '../_shared/http.ts';
import { upsertDefect, resolveDefect, type IngestDefect } from '../_shared/qaseDefectIngest.ts';

// @ts-expect-error — Deno-only global at runtime
const DENO_ENV: { get: (k: string) => string | undefined } = (globalThis as Record<string, unknown>).Deno?.env as { get: (k: string) => string | undefined };

async function hmacSha256Hex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const handler = withTiming('webhook-qase', async (req: Request): Promise<Response> => {
  const pre = corsPreflight(req);
  if (pre) return pre;
  const url = new URL(req.url);
  const path = url.pathname.replace(/^.*\/webhook-qase/, '') || '/';

  if (path === '/health' && req.method === 'GET') return ok({ ok: true });
  if (req.method !== 'POST') return fail('METHOD_NOT_ALLOWED', `${req.method} not allowed`, 405);

  const raw = await req.text();
  const sig = req.headers.get('x-qase-signature') ?? req.headers.get('X-Qase-Signature') ?? '';
  const secret = DENO_ENV?.get?.('QASE_WEBHOOK_SECRET') ?? '';
  if (!secret) return fail('CONFIG_ERROR', 'QASE_WEBHOOK_SECRET not configured on the function', 500);
  if (!sig) return fail('UNAUTHORIZED', 'Missing X-Qase-Signature header', 401);
  const expected = await hmacSha256Hex(secret, raw);
  if (!timingSafeEqualHex(sig.trim(), expected)) return fail('UNAUTHORIZED', 'Signature mismatch', 401);

  let payload: { event?: string; data?: IngestDefect };
  try { payload = JSON.parse(raw); } catch { return fail('VALIDATION', 'Body is not valid JSON', 400); }
  const event = typeof payload.event === 'string' ? payload.event : '';
  const data = (payload.data ?? {}) as IngestDefect;
  if (!event.startsWith('defect.')) return ok({ ignored: true, reason: `event=${event} not handled` });
  if (!data.id) return fail('VALIDATION', 'data.id is required', 422);

  const db = serviceClient();
  try {
    if (event === 'defect.resolved') return ok(await resolveDefect(db, String(data.id)));
    return ok(await upsertDefect(db, 'webhook', data));
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return pgFail({ code: err.code, message: err.message ?? 'qase ingest failed' });
  }
});

serve(handler);
