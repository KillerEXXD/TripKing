import type { ErrorCode } from './codes.ts';

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key, x-admin-key',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
};

/** Returns a 204 response for an OPTIONS preflight, else null. */
export function corsPreflight(req: Request): Response | null {
  return req.method === 'OPTIONS' ? new Response(null, { status: 204, headers: corsHeaders }) : null;
}

function envelope(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

/** `{ success:true, data, meta?, error:null }` */
export function ok(data: unknown, meta?: unknown): Response {
  return envelope(meta === undefined ? { success: true, data, error: null } : { success: true, data, meta, error: null }, 200);
}

/** `{ success:false, data:null, error:{ code, message, ...extra } }` — prefer a standard `ErrorCode`; other strings allowed for endpoint-specific codes. */
export function fail(code: ErrorCode | (string & {}), message: string, status = 400, extra?: Record<string, unknown>): Response {
  return envelope({ success: false, data: null, error: { code, message, ...(extra ?? {}) } }, status);
}
