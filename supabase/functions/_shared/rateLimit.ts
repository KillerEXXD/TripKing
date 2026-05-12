/**
 * Fixed-window rate limiting, backed by the `rate_limits` table + `check_rate_limit()` SQL
 * function (migration 005). Call `rateLimitOk(db, bucket, max, windowSec)` — it returns `true`
 * if the request is ALLOWED. Fails *open* (returns `true`) on any error — a rate-limiter glitch
 * must never take down a route.
 */
// @ts-expect-error — resolved by Deno at runtime; not compiled by the app's tsc.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export async function rateLimitOk(db: SupabaseClient, bucket: string, max: number, windowSec: number): Promise<boolean> {
  try {
    const { data, error } = await db.rpc('check_rate_limit', { p_bucket: bucket, p_max: max, p_window_sec: windowSec });
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
}
