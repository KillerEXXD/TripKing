/**
 * Shared auth helpers for edge functions.
 *
 * - bearer(req) — extract the Bearer token from the Authorization header.
 * - authUser(db, req, opts?) — validate the token via supabase.auth.getUser and join `public.users`
 *   to read the caller's role. Returns null for missing/invalid tokens. `opts.defaultRole` lets
 *   callers pick the fallback when the auth user has no `public.users` row yet (default 'driver';
 *   the /agents function passes 'trip_manager').
 * - isAdmin(user) — role check.
 *
 * Every edge function used to redefine these locally; consolidating ensures one place to
 * change the auth contract (e.g. when we move off Supabase Auth).
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type AuthedUser = { id: string; role: string };
type Db = SupabaseClient;

export function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') ?? req.headers.get('Authorization');
  return h && h.startsWith('Bearer ') ? h.slice(7) : null;
}

export async function authUser(db: Db, req: Request, opts: { defaultRole?: string } = {}): Promise<AuthedUser | null> {
  const token = bearer(req);
  if (!token) return null;
  const { data, error } = await db.auth.getUser(token);
  if (error || !data?.user) return null;
  const { data: u } = await db.from('users').select('id, role').eq('id', data.user.id).maybeSingle();
  return u ? { id: u.id as string, role: u.role as string } : { id: data.user.id, role: opts.defaultRole ?? 'driver' };
}

export const isAdmin = (u: { role: string } | null | undefined): boolean => u?.role === 'admin';
