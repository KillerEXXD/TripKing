/**
 * Deno unit tests for the CORS / envelope helpers.
 *   Run:  deno test supabase/functions/_shared/__tests__/cors.test.ts
 */
import { corsHeaders, corsPreflight, ok, fail } from '../cors.ts';

async function jsonBody(res: Response): Promise<Record<string, unknown>> {
  return JSON.parse(await res.text()) as Record<string, unknown>;
}

Deno.test('corsPreflight — returns 204 for OPTIONS with CORS headers', () => {
  const res = corsPreflight(new Request('https://x/', { method: 'OPTIONS' }));
  if (!res) throw new Error('expected a Response');
  if (res.status !== 204) throw new Error(`expected 204, got ${res.status}`);
  if (res.headers.get('Access-Control-Allow-Origin') !== '*') throw new Error('missing CORS allow-origin');
});

Deno.test('corsPreflight — returns null for non-OPTIONS', () => {
  if (corsPreflight(new Request('https://x/', { method: 'GET' })) !== null) {
    throw new Error('expected null for GET');
  }
});

Deno.test('ok — wraps data in success envelope', async () => {
  const res = ok({ id: 1 });
  if (res.status !== 200) throw new Error(`status ${res.status}`);
  const body = await jsonBody(res);
  if (body.success !== true) throw new Error('success !== true');
  if (body.error !== null) throw new Error('error should be null');
  if ((body.data as { id: number }).id !== 1) throw new Error('data did not round-trip');
  if ('meta' in body) throw new Error('meta should be omitted when absent');
  if (res.headers.get('Content-Type') !== 'application/json') throw new Error('wrong content-type');
});

Deno.test('ok — includes meta when provided', async () => {
  const res = ok([1, 2], { page: 1, total: 2 });
  const body = await jsonBody(res);
  if (!body.meta || (body.meta as { total: number }).total !== 2) throw new Error('meta missing');
});

Deno.test('fail — wraps error in envelope with status and code', async () => {
  const res = fail('VALIDATION', 'bad input', 422);
  if (res.status !== 422) throw new Error(`status ${res.status}`);
  const body = await jsonBody(res);
  if (body.success !== false) throw new Error('success should be false');
  if (body.data !== null) throw new Error('data should be null');
  const err = body.error as { code: string; message: string };
  if (err.code !== 'VALIDATION') throw new Error('code wrong');
  if (err.message !== 'bad input') throw new Error('message wrong');
});

Deno.test('fail — defaults to status 400', () => {
  const res = fail('VALIDATION', 'x');
  if (res.status !== 400) throw new Error(`expected 400, got ${res.status}`);
});

Deno.test('fail — merges extra fields into error object', async () => {
  const res = fail('RATE_LIMITED', 'slow down', 429, { retryAfter: 30 });
  const body = await jsonBody(res);
  const err = body.error as { retryAfter: number };
  if (err.retryAfter !== 30) throw new Error('extra not merged');
});

Deno.test('corsHeaders — exports the expected allow-methods set', () => {
  const m = corsHeaders['Access-Control-Allow-Methods'];
  for (const verb of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']) {
    if (!m.includes(verb)) throw new Error(`missing ${verb}`);
  }
});
