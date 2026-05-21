/**
 * /config — public platform config (no auth). A curated, NON-SENSITIVE subset of
 * app_settings the browser needs before it knows the user/role: which dispatch
 * algorithm the platform runs ('auto' = "I'm Online" presence + token-queue;
 * 'manual' = "I'm vacant" + apply + agent-picks) plus the Auto-dispatch timings
 * the UI displays (offer window, offline grace, heartbeat cadence).
 *
 * Deliberately omits commercial settings (commission, bata, fees). Cached short so
 * an admin algorithm flip propagates within ~30s.
 *
 * withTiming; verify_jwt = false (same posture as the public /trips, /vacancies reads).
 */
// @ts-expect-error — Deno std, resolved at runtime
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsPreflight, ok, fail } from '../_shared/cors.ts';
import { withTiming } from '../_shared/timing.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { setCacheControl } from '../_shared/httpCache.ts';

const handler = withTiming('config', async (req: Request): Promise<Response> => {
  const pre = corsPreflight(req);
  if (pre) return pre;

  const url = new URL(req.url);
  if (!/\/config\/?$/.test(url.pathname)) return fail('NOT_FOUND', 'Unknown config route', 404);
  if (req.method !== 'GET') return fail('METHOD_NOT_ALLOWED', 'GET only', 405);

  const db = serviceClient();
  const { data, error } = await db
    .from('app_settings')
    .select('dispatch_algorithm, dispatch_offer_seconds, dispatch_offline_grace_seconds, dispatch_heartbeat_stale_seconds')
    .eq('id', 1)
    .single();
  if (error) return fail('DB_ERROR', error.message, 500);

  const payload = {
    dispatch_algorithm: data.dispatch_algorithm === 'auto' ? 'auto' : 'manual',
    dispatch_offer_seconds: data.dispatch_offer_seconds,
    dispatch_offline_grace_seconds: data.dispatch_offline_grace_seconds,
    dispatch_heartbeat_stale_seconds: data.dispatch_heartbeat_stale_seconds,
  };
  return setCacheControl(ok(payload), { ttl: 30, scope: 'public' });
});

serve(handler);
