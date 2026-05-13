/**
 * Deno unit tests for the rateLimitOk wrapper — fake SupabaseClient via a duck-typed object.
 *   Run:  deno test supabase/functions/_shared/__tests__/rateLimit.test.ts
 */
// @ts-expect-error — matches the runtime import in rateLimit.ts (resolved by Deno).
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { rateLimitOk } from '../rateLimit.ts';

function fakeDb(rpcReturn: { data: unknown; error: unknown } | (() => Promise<never>)): SupabaseClient {
  const rpc = typeof rpcReturn === 'function'
    ? rpcReturn
    : (): Promise<typeof rpcReturn> => Promise.resolve(rpcReturn);
  return { rpc } as unknown as SupabaseClient;
}

Deno.test('rateLimitOk — true when RPC returns true', async () => {
  const ok = await rateLimitOk(fakeDb({ data: true, error: null }), 'b', 1, 60);
  if (ok !== true) throw new Error('expected true');
});

Deno.test('rateLimitOk — false when RPC returns false', async () => {
  const ok = await rateLimitOk(fakeDb({ data: false, error: null }), 'b', 1, 60);
  if (ok !== false) throw new Error('expected false');
});

Deno.test('rateLimitOk — fails OPEN when RPC returns an error', async () => {
  const ok = await rateLimitOk(fakeDb({ data: null, error: { message: 'boom' } }), 'b', 1, 60);
  if (ok !== true) throw new Error('rate-limit RPC error must fail open');
});

Deno.test('rateLimitOk — fails OPEN when RPC throws', async () => {
  const thrower = (): Promise<never> => Promise.reject(new Error('network down'));
  const ok = await rateLimitOk(fakeDb(thrower), 'b', 1, 60);
  if (ok !== true) throw new Error('rate-limit throw must fail open');
});
