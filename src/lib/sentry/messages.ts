/**
 * Friendly user-facing text for a thrown error, keyed off {@link classifyError}.
 *
 * Plain English for now (TripKing has no i18n layer yet — CLAUDE.md flags it as
 * required; when it lands, swap `MESSAGES` lookups for `t('errors.<category>')`).
 * Prefer the server's own message when it's safe and specific (validation /
 * conflict / rate-limit), otherwise fall back to the category default.
 */

import { classifyError, type ErrorCategory } from './dataErrors';

const MESSAGES: Record<ErrorCategory, string> = {
  network: "Couldn't reach the server — check your connection and try again.",
  timeout: 'That took too long — try again.',
  server_5xx: 'Something went wrong on our side. We’ve been notified — please try again shortly.',
  rate_limit: 'Too many requests — wait a moment and try again.',
  not_found: "We couldn't find that — it may have been removed.",
  forbidden: "You don't have permission to do that.",
  unauthorized: 'Please sign in again to continue.',
  client_4xx: 'That request was rejected — please review and try again.',
  parse: 'We got an unexpected response from the server — please try again.',
  transform: 'We got an unexpected response from the server — please try again.',
  validation: 'Please check the details and try again.',
  render: 'This page hit a snag — reloading usually fixes it.',
  unknown: 'Something went wrong — please try again.',
};

/** Categories where the API's own `error.message` is safe + specific enough to show verbatim. */
const PREFER_SERVER_MESSAGE = new Set<ErrorCategory>(['validation', 'rate_limit', 'forbidden', 'client_4xx']);

interface MaybeApiError {
  name?: string;
  message?: string;
  status?: number;
}

/** Pick the best user-facing message for an error: server message for safe categories, else the category default. */
export function messageForError(error: unknown): string {
  const category = classifyError(error);
  if (PREFER_SERVER_MESSAGE.has(category) && error && typeof error === 'object') {
    const e = error as MaybeApiError;
    const msg = typeof e.message === 'string' ? e.message.trim() : '';
    // Guard against leaking stack-y / generic messages.
    if (msg && msg.length <= 200 && e.name === 'ApiError' && !/request failed|fetch|undefined/i.test(msg)) return msg;
  }
  return MESSAGES[category];
}

/** The category → default-message map (exported for tests / direct lookups). */
export { MESSAGES as ERROR_MESSAGES };
