import posthog from 'posthog-js';
import { logger } from '@/lib/logger';

let initialized = false;

/** Init PostHog if `VITE_POSTHOG_KEY` is set (no-op otherwise). Called once from `main.tsx`. */
export function initPostHog(): void {
  const key = import.meta.env.VITE_POSTHOG_KEY;
  if (!key || initialized) return;
  posthog.init(key, {
    api_host: import.meta.env.VITE_POSTHOG_HOST ?? 'https://us.i.posthog.com',
    capture_pageview: false, // sent manually on route change — see PostHogPageviewTracker
    autocapture: true,
  });
  initialized = true;
}

export function captureEvent(event: string, props?: Record<string, unknown>): void {
  if (!initialized) {
    logger.debug(`[posthog:${event}]`, props);
    return;
  }
  posthog.capture(event, props);
}

export function capturePageview(path: string): void {
  if (initialized) posthog.capture('$pageview', { $current_url: path });
}

export function identifyUser(id: string, props?: Record<string, unknown>): void {
  if (initialized) posthog.identify(id, props);
}

export function resetUser(): void {
  if (initialized) posthog.reset();
}

/** Current PostHog session id (for cross-linking a Sentry event to its replay). `''` if unavailable. */
export function getPostHogSessionId(): string {
  if (!initialized) return '';
  try {
    return posthog.get_session_id() || '';
  } catch {
    return '';
  }
}
