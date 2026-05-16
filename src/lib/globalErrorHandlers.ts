/**
 * L0 global safety net — the outermost catch in the layered exception handling.
 *
 * Sentry's default `globalHandlersIntegration` already captures uncaught errors
 * and unhandled promise rejections, so this layer deliberately does **not**
 * re-capture (that would double-report). It exists to:
 *   - log every uncaught error / rejection with the consistent `[TripKing]` prefix,
 *   - leave a breadcrumb for resource-load failures (failed `<img>`/`<script>`/CSS),
 *     which Sentry does not record by default but which often precede a real error.
 *
 * Install once from `main.tsx`, right after `initSentry()`.
 */

import * as Sentry from '@sentry/react';
import { logger } from '@/lib/logger';
import { isReported } from '@/lib/sentry';

let installed = false;

/**
 * Stale-bootstrap recovery. `lazyWithRetry` already auto-reloads when a `React.lazy`
 * dynamic `import()` fails — but that only catches *route* chunks. The bootstrap
 * vendor chunks (`vendor-react`, `vendor-query`, etc., per `rollupOptions.manualChunks`)
 * load via `<script type="module">` at HTML parse time and fail BEFORE any JS runs.
 * They surface here as `error` events on `window` with the script element as `target`.
 *
 * When that happens after a fresh deploy, the page is dead and the user sees only
 * a wall of "Failed to load module script: Expected a JavaScript-or-Wasm" errors
 * (because Vercel SPA-falls-back the missing chunk URL to `index.html`).
 * Reloading the page once fetches the current `index.html` (Vercel's
 * `Cache-Control: public, max-age=0, must-revalidate` ensures it's fresh) and
 * resolves the wedge.
 *
 * Loop guard: `sessionStorage` records the timestamp of the last auto-reload. We
 * only auto-reload if it's been > 30s — guards against an actual broken deploy
 * sending the page into an infinite reload spin.
 */
const RELOAD_KEY = 'tk-stale-bootstrap-reload-at';
const RELOAD_MIN_INTERVAL_MS = 30_000;

function looksLikeOurBootstrapChunk(url: string): boolean {
  // Same-origin /assets/*.{js,mjs,css} — matches Vite's content-hashed bundle filenames.
  try {
    const u = new URL(url, window.location.origin);
    if (u.origin !== window.location.origin) return false;
    return /^\/assets\/.*\.(js|mjs|css)(\?.*)?$/.test(u.pathname);
  } catch {
    return false;
  }
}

function tryReloadOnce(reason: string): void {
  let last = 0;
  try { last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0; } catch { /* sessionStorage disabled */ }
  const elapsed = Date.now() - last;
  if (elapsed < RELOAD_MIN_INTERVAL_MS) {
    logger.warn(`[stale-bootstrap] suppressing reload (${Math.round(elapsed / 1000)}s since last) — likely a real broken deploy:`, reason);
    return;
  }
  try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch { /* nop */ }
  logger.warn('[stale-bootstrap] bootstrap chunk failed — reloading for the latest bundle:', reason);
  window.location.reload();
}

export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener(
    'error',
    (event: ErrorEvent) => {
      // Resource-load error (img/script/link) — `target` is the element, no `error`.
      const target = event.target as (HTMLElement & { src?: string; href?: string }) | null;
      if (target && target !== (window as unknown as EventTarget) && (target.src || target.href) && !event.error) {
        const url = target.src ?? target.href ?? '';
        logger.warn('resource failed to load:', url);
        Sentry.addBreadcrumb({ category: 'resource', level: 'warning', message: `failed to load ${target.tagName?.toLowerCase()}`, data: { url } });
        // Stale-bootstrap auto-recovery: if a same-origin /assets/*.js failed at script-load time,
        // the page's HTML references a chunk that no longer exists on the server. Reload once.
        if (target.tagName === 'SCRIPT' && looksLikeOurBootstrapChunk(url)) {
          tryReloadOnce(url);
        }
        return;
      }
      if (isReported(event.error)) return;
      logger.error('uncaught error:', event.error ?? event.message);
    },
    true, // capture phase — needed to see resource-load errors
  );

  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    if (isReported(event.reason)) return;
    logger.error('unhandled promise rejection:', event.reason);
  });
}
