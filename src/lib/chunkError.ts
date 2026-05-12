/**
 * Detect a "code-split chunk failed to download" error — almost always a stale
 * deployment (the user's HTML references a hashed asset that no longer exists).
 * The fix is always the same: reload so the browser fetches the current bundle.
 * Used by `ErrorBoundary` (reload instead of reporting) and shared with tests.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.name === 'ChunkLoadError' ||
    /loading chunk \d+ failed/i.test(error.message) ||
    /loading css chunk/i.test(error.message) ||
    /failed to fetch dynamically imported module/i.test(error.message) ||
    /importing a module script failed/i.test(error.message) ||
    /dynamically imported module/i.test(error.message)
  );
}
