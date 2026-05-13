/**
 * Deno unit tests for the Phase-2 HTTP cache header helpers.
 *   deno test --no-check --allow-read --allow-env --allow-net supabase/functions/_shared/__tests__/httpCache.test.ts
 */

import { cacheControl, maybeNotModified, setCacheControl, weakEtagFor } from '../httpCache.ts';

Deno.test("cacheControl — public emits max-age + s-maxage + SWR", () => {
  const v = cacheControl({ ttl: 900, scope: 'public' });
  if (!v.includes('public')) throw new Error(`missing 'public': ${v}`);
  if (!v.includes('max-age=900')) throw new Error(`missing max-age: ${v}`);
  if (!v.includes('s-maxage=900')) throw new Error(`missing s-maxage: ${v}`);
  if (!v.includes('stale-while-revalidate=900')) throw new Error(`missing SWR: ${v}`);
});

Deno.test("cacheControl — private skips s-maxage so CDNs don't share", () => {
  const v = cacheControl({ ttl: 60, scope: 'private' });
  if (!v.includes('private')) throw new Error(`missing 'private': ${v}`);
  if (v.includes('s-maxage')) throw new Error(`private must not set s-maxage: ${v}`);
  if (!v.includes('max-age=60')) throw new Error(`missing max-age: ${v}`);
});

Deno.test('cacheControl — ttl<=0 emits no-store', () => {
  const v = cacheControl({ ttl: 0, scope: 'public' });
  if (!v.includes('no-store')) throw new Error(`expected no-store, got: ${v}`);
});

Deno.test('setCacheControl — stamps the header on a Response', () => {
  const res = new Response('{}', { status: 200 });
  setCacheControl(res, { ttl: 30, scope: 'public' });
  if (!res.headers.get('Cache-Control')?.includes('max-age=30')) {
    throw new Error('Cache-Control was not stamped');
  }
});

Deno.test('weakEtagFor — stable for the same body', async () => {
  const a = await weakEtagFor('{"hello":"world"}');
  const b = await weakEtagFor('{"hello":"world"}');
  if (a !== b) throw new Error('etag must be deterministic');
  if (!a.startsWith('W/"')) throw new Error(`expected weak ETag, got ${a}`);
});

Deno.test('weakEtagFor — differs for different bodies', async () => {
  const a = await weakEtagFor('{"a":1}');
  const b = await weakEtagFor('{"a":2}');
  if (a === b) throw new Error('etag should differ when body differs');
});

Deno.test('maybeNotModified — returns 304 when If-None-Match matches', async () => {
  const body = '{"x":1}';
  const etag = await weakEtagFor(body);
  const req = new Request('https://example.com/', { headers: { 'If-None-Match': etag } });
  const original = new Response(body, { status: 200, headers: { 'Cache-Control': 'public, max-age=60', 'X-Cache': 'memory' } });
  const res = await maybeNotModified(req, original, body);
  if (res.status !== 304) throw new Error(`expected 304, got ${res.status}`);
  if (res.headers.get('ETag') !== etag) throw new Error('304 must echo the ETag');
  if (res.headers.get('Cache-Control') !== 'public, max-age=60') throw new Error('304 must preserve Cache-Control');
  if (res.headers.get('X-Cache') !== 'memory') throw new Error('304 must preserve X-Cache');
});

Deno.test('maybeNotModified — stamps ETag and returns 200 when no match', async () => {
  const body = '{"x":1}';
  const req = new Request('https://example.com/', { headers: { 'If-None-Match': 'W/"stale"' } });
  const original = new Response(body, { status: 200 });
  const res = await maybeNotModified(req, original, body);
  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}`);
  const etag = res.headers.get('ETag');
  if (!etag?.startsWith('W/"')) throw new Error(`ETag header missing or malformed: ${etag}`);
});
