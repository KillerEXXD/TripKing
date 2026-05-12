/**
 * PostHog bootstrap.
 *
 * Stub for the scaffold commit; the real `posthog-js` init (`VITE_POSTHOG_KEY`
 * / `VITE_POSTHOG_HOST`, session recording, autocapture) + the pageview
 * tracker land in the "providers + bootstrap" commit.
 */
export function initPostHog(): void {
  // intentionally empty until PostHog is wired
}

export function captureEvent(_event: string, _props?: Record<string, unknown>): void {
  // intentionally empty until PostHog is wired
}
