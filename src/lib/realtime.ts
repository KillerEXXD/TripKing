import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

/**
 * Browser Realtime transport — the ONE place the frontend opens a direct
 * connection to Supabase. It is used strictly as a change-notification SIGNAL
 * (see `useRealtimeSubscriptions`): the row payloads are never rendered; all
 * data still flows through the REST API + edge-function transforms/redaction.
 * This is the documented carve-out to architecture rule #1 (CLAUDE.md §API).
 *
 * Hard rule: never call `.from(...).select()` / mutations on this client — it
 * exists only for `.channel(...)` subscriptions. Data access goes through
 * `apiClient`.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

let client: SupabaseClient | null = null;

/** True when the env is configured for Realtime. When false, the app falls back
 *  to React Query polling and every helper here is a no-op. */
export function isRealtimeConfigured(): boolean {
  return !!SUPABASE_URL && !!SUPABASE_ANON_KEY && typeof window !== 'undefined';
}

/** Lazily create the singleton transport client. Returns null when unconfigured
 *  (tests / SSR / missing env) so callers degrade to polling without throwing. */
export function getRealtimeClient(): SupabaseClient | null {
  if (!isRealtimeConfigured()) return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 5 } },
    });
    logger.debug('[realtime] client created');
  }
  return client;
}

/** Point the Realtime connection at the current user's Supabase JWT so RLS can
 *  evaluate `auth.uid()` per subscription. Called on login and on every token
 *  rotation (wired from apiClient.onTokenChange). A null token clears auth. */
export function setRealtimeAuth(token: string | null): void {
  const c = getRealtimeClient();
  if (!c) return;
  c.realtime.setAuth(token);
}

/** Tear down all channels + close the socket (called on logout). */
export function disconnectRealtime(): void {
  if (!client) return;
  void client.removeAllChannels();
  client.realtime.disconnect();
  logger.debug('[realtime] disconnected');
}
