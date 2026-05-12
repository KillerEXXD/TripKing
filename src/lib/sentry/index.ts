/**
 * Sentry hub — `import { … } from '@/lib/sentry'`.
 *
 *  - `initSentry()`            — one-time bootstrap (called from `main.tsx`)
 *  - `setSentryUser` / `clearSentryUser` — user context (called from `AuthContext`)
 *  - `captureDataError`, `addDataBreadcrumb`, `classifyError`, `withErrorTracking`,
 *    `captureDataPerformanceIssue`, `startDataTransaction`, `getSentryDebugIds` — the
 *    data-layer reporting surface (apiClient, React Query caches, ErrorBoundary, …)
 *  - `markReported` / `isReported` — the "report once" marker shared by every layer
 *  - `messageForError` — friendly user-facing text for a thrown error
 */

export { initSentry, isSentryInitialized } from './init';
export { setSentryUser, clearSentryUser, type SentryUserInfo } from './user';
export {
  captureDataError,
  addDataBreadcrumb,
  captureDataPerformanceIssue,
  startDataTransaction,
  withErrorTracking,
  classifyError,
  getSentryDebugIds,
  type ErrorCategory,
  type DataErrorContext,
  type SentryDebugIds,
} from './dataErrors';
export { markReported, isReported } from './report';
export { messageForError, ERROR_MESSAGES } from './messages';
