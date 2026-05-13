/**
 * Deno unit tests for the withTiming wrapper.
 *   Run:  deno test --allow-env --allow-net supabase/functions/_shared/__tests__/timing.test.ts
 *
 * timing.ts imports `serviceClient` (which throws if SUPABASE_URL/SERVICE_ROLE_KEY are unset)
 * and `captureServerException` (no-op when SENTRY_DSN unset). We DELETE those envs so the
 * metrics-persist call short-circuits to a no-op and no Sentry envelope is POSTed.
 */
import { withTiming } from '../timing.ts';

function withCleanEnv<T>(fn: () => Promise<T>): Promise<T> {
  const saved: Record<string, string | undefined> = {
    SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    SENTRY_DSN: Deno.env.get('SENTRY_DSN'),
  };
  Deno.env.delete('SUPABASE_URL');
  Deno.env.delete('SUPABASE_SERVICE_ROLE_KEY');
  Deno.env.delete('SENTRY_DSN');
  return fn().finally(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) Deno.env.delete(k);
      else Deno.env.set(k, v);
    }
  });
}

Deno.test('withTiming — passes the response through and stamps Server-Timing', async () => {
  await withCleanEnv(async () => {
    const handler = (): Promise<Response> => Promise.resolve(new Response('ok', { status: 200 }));
    const wrapped = withTiming('test-fn', handler);
    const res = await wrapped(new Request('https://x/path', { method: 'GET' }));
    if (res.status !== 200) throw new Error(`status ${res.status}`);
    const st = res.headers.get('Server-Timing');
    if (!st || !st.includes('total;dur=')) throw new Error(`Server-Timing missing/bad: ${st}`);
    if (!st.includes('desc="test-fn"')) throw new Error('Server-Timing desc missing');
  });
});

Deno.test('withTiming — catches a thrown error and returns a 500 INTERNAL envelope', async () => {
  await withCleanEnv(async () => {
    const handler = (): Promise<Response> => {
      throw new Error('boom');
    };
    const wrapped = withTiming('test-fn', handler);
    const res = await wrapped(new Request('https://x/oops', { method: 'POST' }));
    if (res.status !== 500) throw new Error(`expected 500, got ${res.status}`);
    const body = JSON.parse(await res.text()) as { success: boolean; error: { code: string } };
    if (body.success !== false) throw new Error('success should be false');
    if (body.error.code !== 'INTERNAL') throw new Error(`code expected INTERNAL, got ${body.error.code}`);
    if (!res.headers.get('Server-Timing')) throw new Error('Server-Timing should be set even on error');
  });
});

Deno.test('withTiming — does not crash on an OPTIONS preflight passthrough', async () => {
  await withCleanEnv(async () => {
    const handler = (): Promise<Response> => Promise.resolve(new Response(null, { status: 204 }));
    const wrapped = withTiming('test-fn', handler);
    const res = await wrapped(new Request('https://x/', { method: 'OPTIONS' }));
    if (res.status !== 204) throw new Error(`status ${res.status}`);
  });
});

Deno.test('withTiming — preserves arbitrary headers from the handler response', async () => {
  await withCleanEnv(async () => {
    const handler = (): Promise<Response> =>
      Promise.resolve(new Response('{}', { status: 200, headers: { 'X-Custom': 'yes', 'X-Cache': 'memory' } }));
    const wrapped = withTiming('test-fn', handler);
    const res = await wrapped(new Request('https://x/', { method: 'GET' }));
    if (res.headers.get('X-Custom') !== 'yes') throw new Error('custom header lost');
    if (res.headers.get('X-Cache') !== 'memory') throw new Error('X-Cache lost');
  });
});
