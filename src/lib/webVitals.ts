/**
 * Subscribe to Core Web Vitals (LCP, INP, CLS, FCP, TTFB) via Google's `web-vitals`
 * library and forward each metric to PostHog as a `$web_vitals` event. This is the
 * twin of `@vercel/speed-insights` — same metrics, but they land in PostHog where
 * we can query them via HogQL from `/posthog` and `/fullstatus`.
 *
 * Call `wireWebVitals()` once at app boot, after `initPostHog()`.
 *
 * Event shape (matches PostHog's built-in `$web_vitals` convention):
 *   - metric_name: 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB'
 *   - metric_value: number — milliseconds (or unit-less for CLS)
 *   - metric_rating: 'good' | 'needs-improvement' | 'poor'  (per web-vitals)
 *   - metric_navigation_type: 'navigate' | 'reload' | 'back-forward' | 'back-forward-cache' | 'prerender' | 'restore'
 *   - $current_url, $pathname — set by PostHog from window.location
 *
 * Each metric fires once per page load (CLS / INP / LCP report on visibility hidden
 * or page unload; FCP / TTFB are one-shot). web-vitals handles all the timing.
 */
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';
import { captureEvent } from '@/lib/posthog';

let wired = false;

/** No-op if already called (StrictMode mounts components twice in dev). */
export function wireWebVitals(): void {
  if (wired || typeof window === 'undefined') return;
  wired = true;

  const send = (m: Metric) => {
    captureEvent('$web_vitals', {
      metric_name: m.name,
      metric_value: m.value,
      metric_rating: m.rating,
      metric_navigation_type: m.navigationType,
      metric_delta: m.delta,
      metric_id: m.id,
      $current_url: typeof window !== 'undefined' ? window.location.href : undefined,
      $pathname: typeof window !== 'undefined' ? window.location.pathname : undefined,
    });
  };

  onLCP(send);
  onINP(send);
  onCLS(send);
  onFCP(send);
  onTTFB(send);
}
