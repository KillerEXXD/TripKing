// @ts-expect-error — resolved by Deno at runtime; this file is not compiled by the app's tsc.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/** Service-role client (bypasses RLS) — used by the /admin/* edge function. */
export function serviceClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set');
  return createClient(url, key, { auth: { persistSession: false } });
}
