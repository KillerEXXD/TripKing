/**
 * Deno unit tests for the cloudflare-purge helper.
 *   deno test --no-check --allow-read --allow-env --allow-net \
 *     supabase/functions/_shared/__tests__/cloudflarePurge.test.ts
 *
 * Network-dependent paths (the actual purge POST) are exercised by stubbing
 * `globalThis.fetch`; nothing here ever hits Cloudflare for real.
 */

import { purgeCloudflare, purgeUrlsFor } from '../cloudflarePurge.ts';

// ── purgeUrlsFor ─────────────────────────────────────────────────────────────

Deno.test('purgeUrlsFor — prepends the API base to bare paths', () => {
  const out = purgeUrlsFor(['/functions/v1/admin/car-types', '/functions/v1/admin/cities']);
  if (out[0] !== 'https://api.tripkingapp.com/functions/v1/admin/car-types') {
    throw new Error(`bad URL: ${out[0]}`);
  }
  if (out[1] !== 'https://api.tripkingapp.com/functions/v1/admin/cities') {
    throw new Error(`bad URL: ${out[1]}`);
  }
});

Deno.test('purgeUrlsFor — passes absolute URLs through unchanged', () => {
  const u = 'https://api.tripkingapp.com/functions/v1/trips';
  const out = purgeUrlsFor([u]);
  if (out[0] !== u) throw new Error(`absolute URL was rewritten: ${out[0]}`);
});

Deno.test('purgeUrlsFor — accepts a custom base', () => {
  const out = purgeUrlsFor(['/x'], 'https://staging.tripkingapp.com');
  if (out[0] !== 'https://staging.tripkingapp.com/x') throw new Error(out[0]);
});

// ── purgeCloudflare ──────────────────────────────────────────────────────────

const ORIGINAL_FETCH = globalThis.fetch;
function withFetch(fn: typeof fetch, body: () => Promise<void>): Promise<void> {
  globalThis.fetch = fn;
  return body().finally(() => {
    globalThis.fetch = ORIGINAL_FETCH;
  });
}

Deno.test('purgeCloudflare — empty list short-circuits to true', async () => {
  let called = false;
  await withFetch(() => { called = true; return Promise.resolve(new Response('{}')); }, async () => {
    const ok = await purgeCloudflare([]);
    if (!ok) throw new Error('empty list should resolve to true');
    if (called) throw new Error('fetch should not be called for an empty list');
  });
});

Deno.test('purgeCloudflare — returns false when secrets missing', async () => {
  // Save/restore env vars so other tests aren't affected.
  const oldZ = Deno.env.get('CLOUDFLARE_ZONE_ID');
  const oldT = Deno.env.get('CLOUDFLARE_PURGE_TOKEN');
  Deno.env.delete('CLOUDFLARE_ZONE_ID');
  Deno.env.delete('CLOUDFLARE_PURGE_TOKEN');
  try {
    let called = false;
    await withFetch(() => { called = true; return Promise.resolve(new Response('{}')); }, async () => {
      const ok = await purgeCloudflare(['https://api.tripkingapp.com/x']);
      if (ok) throw new Error('expected false when secrets missing');
      if (called) throw new Error('fetch must not be called without secrets');
    });
  } finally {
    if (oldZ !== undefined) Deno.env.set('CLOUDFLARE_ZONE_ID', oldZ);
    if (oldT !== undefined) Deno.env.set('CLOUDFLARE_PURGE_TOKEN', oldT);
  }
});

Deno.test('purgeCloudflare — POSTs the right shape and returns true on success=true', async () => {
  Deno.env.set('CLOUDFLARE_ZONE_ID', 'zone-x');
  Deno.env.set('CLOUDFLARE_PURGE_TOKEN', 'tok-y');
  let seenUrl = '';
  let seenAuth = '';
  let seenBody: unknown = null;
  const fetchStub: typeof fetch = async (input, init) => {
    seenUrl = typeof input === 'string' ? input : (input as Request).url;
    const headers = new Headers(init?.headers ?? {});
    seenAuth = headers.get('Authorization') ?? '';
    seenBody = JSON.parse(String(init?.body ?? '{}'));
    return new Response(JSON.stringify({ success: true, result: { id: 'ok' } }), { status: 200 });
  };
  await withFetch(fetchStub, async () => {
    const ok = await purgeCloudflare(['https://api.tripkingapp.com/x', 'https://api.tripkingapp.com/y']);
    if (!ok) throw new Error('expected success');
    if (seenUrl !== 'https://api.cloudflare.com/client/v4/zones/zone-x/purge_cache') {
      throw new Error(`bad URL: ${seenUrl}`);
    }
    if (seenAuth !== 'Bearer tok-y') throw new Error(`bad Authorization: ${seenAuth}`);
    const body = seenBody as { files?: string[] };
    if (!Array.isArray(body.files) || body.files.length !== 2) {
      throw new Error(`bad body: ${JSON.stringify(body)}`);
    }
  });
});

Deno.test('purgeCloudflare — returns false on non-2xx', async () => {
  Deno.env.set('CLOUDFLARE_ZONE_ID', 'zone-x');
  Deno.env.set('CLOUDFLARE_PURGE_TOKEN', 'tok-y');
  const fetchStub: typeof fetch = () => Promise.resolve(new Response('forbidden', { status: 403 }));
  await withFetch(fetchStub, async () => {
    const ok = await purgeCloudflare(['https://api.tripkingapp.com/x']);
    if (ok) throw new Error('expected false on 403');
  });
});

Deno.test('purgeCloudflare — returns false on success:false in body', async () => {
  Deno.env.set('CLOUDFLARE_ZONE_ID', 'zone-x');
  Deno.env.set('CLOUDFLARE_PURGE_TOKEN', 'tok-y');
  const fetchStub: typeof fetch = () => Promise.resolve(new Response(JSON.stringify({ success: false, errors: [{ code: 1001 }] })));
  await withFetch(fetchStub, async () => {
    const ok = await purgeCloudflare(['https://api.tripkingapp.com/x']);
    if (ok) throw new Error('expected false on success:false body');
  });
});

Deno.test('purgeCloudflare — swallows network errors and returns false', async () => {
  Deno.env.set('CLOUDFLARE_ZONE_ID', 'zone-x');
  Deno.env.set('CLOUDFLARE_PURGE_TOKEN', 'tok-y');
  const fetchStub: typeof fetch = () => Promise.reject(new Error('ECONNRESET'));
  await withFetch(fetchStub, async () => {
    const ok = await purgeCloudflare(['https://api.tripkingapp.com/x']);
    if (ok) throw new Error('expected false on network failure');
  });
});
