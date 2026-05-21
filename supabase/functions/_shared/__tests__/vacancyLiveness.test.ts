/**
 * Deno unit tests for the vacancy-liveness helpers.
 *   Run:  deno test supabase/functions/_shared/__tests__/vacancyLiveness.test.ts
 * Kept separate from the frontend Vitest suite (Deno edge-fn module).
 */
import { istMidnightUtcIso, openEndedLiveClause } from '../vacancyLiveness.ts';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

Deno.test('istMidnightUtcIso — returns the UTC instant of today\'s IST midnight (18:30 UTC the prior day)', () => {
  // 2026-05-21 12:00:00 IST  → IST midnight is 2026-05-21 00:00 IST = 2026-05-20 18:30:00 UTC.
  const noonIstUtcMs = Date.UTC(2026, 4, 21, 6, 30, 0); // 06:30 UTC == 12:00 IST
  const got = istMidnightUtcIso(noonIstUtcMs);
  if (got !== '2026-05-20T18:30:00.000Z') throw new Error(`expected 2026-05-20T18:30:00.000Z, got ${got}`);
});

Deno.test('istMidnightUtcIso — just-after IST midnight rolls to the new IST day', () => {
  // 2026-05-21 00:05 IST  == 2026-05-20 18:35 UTC → IST midnight is 2026-05-20 18:30 UTC.
  const justAfterMidnightIstUtcMs = Date.UTC(2026, 4, 20, 18, 35, 0);
  const got = istMidnightUtcIso(justAfterMidnightIstUtcMs);
  if (got !== '2026-05-20T18:30:00.000Z') throw new Error(`expected 2026-05-20T18:30:00.000Z, got ${got}`);
});

Deno.test('istMidnightUtcIso — just-before IST midnight is still the previous IST day', () => {
  // 2026-05-20 23:55 IST == 2026-05-20 18:25 UTC → IST midnight is 2026-05-19 18:30 UTC.
  const justBeforeMidnightIstUtcMs = Date.UTC(2026, 4, 20, 18, 25, 0);
  const got = istMidnightUtcIso(justBeforeMidnightIstUtcMs);
  if (got !== '2026-05-19T18:30:00.000Z') throw new Error(`expected 2026-05-19T18:30:00.000Z, got ${got}`);
});

Deno.test('openEndedLiveClause — composes the PostgREST and(...) sub-clause with the IST-midnight bound', () => {
  const nowMs = Date.UTC(2026, 4, 21, 6, 30, 0);
  const got = openEndedLiveClause(nowMs);
  const expected = 'and(available_until.is.null,available_from.gte.2026-05-20T18:30:00.000Z)';
  if (got !== expected) throw new Error(`expected ${expected}, got ${got}`);
});

Deno.test('istMidnightUtcIso — round-trips to true IST midnight (00:00 when shifted by +5:30)', () => {
  const got = new Date(istMidnightUtcIso(Date.now()));
  const ist = new Date(got.getTime() + IST_OFFSET_MS);
  if (ist.getUTCHours() !== 0 || ist.getUTCMinutes() !== 0) {
    throw new Error(`not IST midnight: ${ist.toISOString()}`);
  }
});
