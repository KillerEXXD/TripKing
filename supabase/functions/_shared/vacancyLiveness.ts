/**
 * Vacancy "still live by time" helpers — the single source of truth for the
 * open-ended-vacancy expiry rule, shared by every path that selects active
 * vacancies (the agent `GET /vacancies` list AND the auto-invite matcher).
 *
 * The expire cron (`expire_stale_vacancies`, migration 058) flips active→expired
 * every 5 min when a window lapses. Between lapse and the next sweep the stored
 * `status` is still 'active', so query-time selection by `status='active'` alone
 * can act on a logically-dead vacancy. These helpers reproduce the cron's rule at
 * query time so invites/listings are correct regardless of cron timing.
 *
 * IST = Asia/Kolkata (UTC+5:30, no DST) is the marketplace's operating timezone;
 * an open-ended vacancy (`available_until IS NULL`) is live only while its
 * `available_from` IST calendar date is today or later — same rule as migration 058.
 *
 * Keep this in lockstep with `expire_stale_vacancies()` — if the SQL rule changes,
 * change it here too (see memory: vacancy-time-bounds-must-mirror).
 */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Today's IST midnight expressed as a UTC ISO string. */
export function istMidnightUtcIso(nowMs: number = Date.now()): string {
  const nowIst = new Date(nowMs + IST_OFFSET_MS);
  const istMidnightUtc = new Date(
    Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate()) - IST_OFFSET_MS,
  );
  return istMidnightUtc.toISOString();
}

/**
 * PostgREST `.or()` sub-clause matching open-ended vacancies that are still live:
 * `and(available_until.is.null,available_from.gte.<istMidnight>)`. Compose it into
 * a larger `.or(...)` alongside the timed-window branch the caller needs.
 */
export function openEndedLiveClause(nowMs: number = Date.now()): string {
  return `and(available_until.is.null,available_from.gte.${istMidnightUtcIso(nowMs)})`;
}
