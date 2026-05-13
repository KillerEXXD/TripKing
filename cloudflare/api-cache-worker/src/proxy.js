/**
 * Build the upstream Request that goes to Supabase, injecting auth headers when the
 * incoming request is anonymous so Supabase's edge accepts it.
 *
 * Pure (returns a Request object, doesn't fetch) — unit-testable.
 */

export function buildOriginRequest(incoming, env) {
  const url = new URL(incoming.url);
  // The frontend hits https://api.tripkingapp.com/functions/v1/... so the path already
  // includes /functions/v1/. The base is the Supabase ROOT (no /functions/v1 suffix).
  const target = `${env.SUPABASE_ORIGIN}${url.pathname}${url.search}`;

  const headers = new Headers(incoming.headers);
  // Strip the public Host so fetch can set its own (Supabase needs the right one).
  headers.delete('host');

  // Anon callers must present the publishable key — inject if missing.
  if (env.SUPABASE_ANON_KEY) {
    if (!headers.has('apikey')) headers.set('apikey', env.SUPABASE_ANON_KEY);
    if (!headers.has('authorization')) {
      headers.set('Authorization', `Bearer ${env.SUPABASE_ANON_KEY}`);
    }
  }

  const init = {
    method: incoming.method,
    headers,
    redirect: 'manual',
  };
  if (incoming.method !== 'GET' && incoming.method !== 'HEAD') {
    init.body = incoming.body;
    // Node's undici (used by Vitest) requires `duplex: 'half'` whenever a Request carries
    // a body. Workers ignore it — safe to set unconditionally.
    init.duplex = 'half';
  }
  return new Request(target, init);
}
