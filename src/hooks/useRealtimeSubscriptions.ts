import { useEffect } from 'react';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { useAuth } from '@/contexts/AuthContext';
import { apiClient } from '@/lib/api/client';
import { queryClient } from '@/lib/queryClient';
import { getRealtimeClient, isRealtimeConfigured, setRealtimeAuth } from '@/lib/realtime';
import { logger } from '@/lib/logger';

/**
 * Live agent surfaces via Supabase Realtime — a SIGNAL, not a SOURCE.
 *
 * Each change event only scopes a `queryClient.invalidateQueries(...)`; the row
 * payload is never rendered. The existing REST hooks then refetch through the
 * edge functions (transforms + per-viewer redaction intact). This is the
 * documented carve-out to architecture rule #1 (see src/lib/realtime.ts).
 *
 * Adding a surface = adding one row to CHANNELS below. Nothing else changes.
 */

type Change = RealtimePostgresChangesPayload<Record<string, unknown>>;
type Row = Record<string, unknown> | undefined;

/** new-row id on INSERT/UPDATE, old-row id on DELETE — used only to scope invalidation. */
function rowField(p: Change, field: string): string | undefined {
  const next = p.new as Row;
  const prev = p.old as Row;
  return (next?.[field] ?? prev?.[field]) as string | undefined;
}

function invalidate(...keys: readonly unknown[][]): void {
  for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
}

interface ChannelSpec {
  /** Postgres table to watch. */
  table: string;
  /** Optional server-side postgres_changes filter (keeps the agent's socket to
   *  their own rows even when the table's SELECT RLS is permissive). */
  filter?: (userId: string) => string | undefined;
  /** Map a change to the query keys to refetch. Reads ids only — never renders. */
  onChange: (p: Change) => void;
}

/** The single source of truth for what's live. RLS on the connection gates which
 *  rows actually reach the client (trip_acceptances → owns_trip/owns_driver;
 *  notifications → user-scoped); the `filter` further narrows trips. */
const CHANNELS: readonly ChannelSpec[] = [
  {
    // An applicant applies / withdraws / is decided → agent's detail + applicants
    // page + posted-trips list all key off these.
    table: 'trip_acceptances',
    onChange: (p) => {
      const tripId = rowField(p, 'trip_id');
      if (tripId) invalidate(['trip', tripId, 'applicants'], ['trip', tripId]);
      invalidate(['trips']);
    },
  },
  {
    // A trip the agent posted changes status (open → has_applicants → selected → …).
    table: 'trips',
    filter: (userId) => `posted_by_user_id=eq.${userId}`,
    onChange: (p) => {
      const id = rowField(p, 'id');
      if (id) invalidate(['trip', id]);
      invalidate(['trips']);
    },
  },
  {
    // New notification for this user (RLS already scopes to user_id = auth.uid()).
    table: 'notifications',
    onChange: () => invalidate(['notifications']),
  },
  {
    // Driver availability feed (find-driver). RLS is public; harmless to refetch.
    table: 'vacancies',
    onChange: () => invalidate(['vacancies']),
  },
];

/**
 * Mounts once under <AuthProvider>. Opens one Realtime channel per CHANNELS
 * entry while a user is signed in; tears them all down on logout / unmount.
 * No-op (app falls back to React Query polling) when Realtime isn't configured.
 */
export function useRealtimeSubscriptions(): void {
  const { user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (!userId || !isRealtimeConfigured()) return;
    const client = getRealtimeClient();
    if (!client) return;

    // Ensure the socket carries the current JWT before subscribing.
    setRealtimeAuth(apiClient.getAccessToken());

    const channels = CHANNELS.map((spec) => {
      const filter = spec.filter?.(userId);
      return client
        .channel(`rt:${spec.table}:${userId}`)
        .on(
          // postgres_changes is correctly typed via the string overload.
          'postgres_changes' as never,
          { event: '*', schema: 'public', table: spec.table, ...(filter ? { filter } : {}) } as never,
          ((payload: Change) => spec.onChange(payload)) as never,
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            logger.debug(`[realtime] ${spec.table} channel ${status} — polling still covers this surface`);
          }
        });
    });

    return () => {
      for (const ch of channels) void client.removeChannel(ch);
    };
  }, [userId]);
}
