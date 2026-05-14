/**
 * Shared HTTP helpers for edge functions.
 *
 * - readBody<T>(req) — parse JSON body, returning `{}` on any failure. Generic so callers
 *   can shape the return type without an extra cast.
 * - pgFail(err, opts?) — map a Postgres error code to a `fail()` envelope.
 *     opts.fkAs:'IN_USE'    reshapes 23503 (FK violation) into the admin-style 409
 *                           "disable instead of delete" used by /admin/* and /vehicles/:id DELETE.
 *     opts.dupMessage       overrides the 23505 message for domain UX (e.g. reviews, video-verifications).
 *     opts.fallbackStatus   custom status for non-pg-coded DB errors (default 400).
 */
import { fail } from './cors.ts';

export async function readBody<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    const b = await req.json();
    return (b && typeof b === 'object' ? b : {}) as T;
  } catch {
    return {} as T;
  }
}

export type PgFailOpts = {
  fallbackStatus?: number;
  fkAs?: 'VALIDATION' | 'IN_USE';
  dupMessage?: string;
};

export function pgFail(error: { code?: string; message: string }, opts: PgFailOpts = {}): Response {
  const { fallbackStatus = 400, fkAs = 'VALIDATION', dupMessage } = opts;
  if (error.code === '23505') return fail('CONFLICT', dupMessage ?? error.message, 409);
  if (error.code === '23503') {
    return fkAs === 'IN_USE'
      ? fail('IN_USE', `${error.message} — it is referenced; disable it instead of deleting`, 409)
      : fail('VALIDATION', error.message, 422);
  }
  if (error.code === '23502' || error.code === '23514' || error.code === '22P02') {
    return fail('VALIDATION', error.message, 422);
  }
  return fail('DB_ERROR', error.message, fallbackStatus);
}
