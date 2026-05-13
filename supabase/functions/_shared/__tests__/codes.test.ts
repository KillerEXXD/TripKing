/**
 * Deno unit tests for the standard ERROR_CODES set.
 *   Run:  deno test supabase/functions/_shared/__tests__/codes.test.ts
 */
import { ERROR_CODES } from '../codes.ts';

Deno.test('ERROR_CODES — exports the 8 standard codes with matching values', () => {
  const expected: Record<string, string> = {
    VALIDATION: 'VALIDATION',
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
    CONFLICT: 'CONFLICT',
    RATE_LIMITED: 'RATE_LIMITED',
    DB_ERROR: 'DB_ERROR',
    INTERNAL: 'INTERNAL',
  };
  for (const [k, v] of Object.entries(expected)) {
    if ((ERROR_CODES as Record<string, string>)[k] !== v) {
      throw new Error(`ERROR_CODES.${k} expected "${v}", got "${(ERROR_CODES as Record<string, string>)[k]}"`);
    }
  }
});
