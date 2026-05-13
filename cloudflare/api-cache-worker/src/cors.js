/**
 * CORS headers — mirror supabase/functions/_shared/cors.ts so the Worker behaves
 * identically to a direct hit on origin. (The Worker terminates the request, so
 * the origin's CORS headers never reach the browser; we have to re-set them here.)
 *
 * Pure — unit-testable.
 */

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-admin-key',
  'Access-Control-Expose-Headers': 'X-Cache, X-Cache-Tier, Server-Timing, CF-Cache-Status, CF-Ray',
  'Access-Control-Max-Age': '86400',
};

/** Build a 204 preflight response (or null if the request isn't an OPTIONS preflight). */
export function preflight(request) {
  return request.method === 'OPTIONS' ? new Response(null, { status: 204, headers: corsHeaders }) : null;
}

/** Return a new Response with CORS headers stamped on top of the original. */
export function withCors(response) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
