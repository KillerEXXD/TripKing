# Web Vitals → PostHog — portable setup

Copy-paste these into any React + Vite + PostHog app (TripKing, TournamentPro, Hudr-pwa) so Core Web Vitals land in PostHog as `$web_vitals` events. Then a `/posthog` (or `/fullstatus`) skill can query Speed Insights with HogQL — no Vercel dashboard required, no extra SaaS.

Tested on TripKing 2026‑05‑15. Five-minute integration; ~2 KB added to the bundle.

---

## 1. Install

```bash
npm install web-vitals
```

`web-vitals` is the official Google library (~2 KB gzipped). Same library Vercel's Speed Insights wraps.

---

## 2. Drop-in module

Create `src/lib/webVitals.ts`:

```ts
/**
 * Subscribe to Core Web Vitals (LCP, INP, CLS, FCP, TTFB) via Google's `web-vitals`
 * library and forward each metric to PostHog as a `$web_vitals` event.
 *
 * Call `wireWebVitals()` once at app boot, AFTER your PostHog init.
 *
 * Event shape:
 *   - metric_name: 'LCP' | 'INP' | 'CLS' | 'FCP' | 'TTFB'
 *   - metric_value: number (ms; unit-less for CLS)
 *   - metric_rating: 'good' | 'needs-improvement' | 'poor'
 *   - metric_navigation_type, metric_delta, metric_id
 *   - $current_url, $pathname
 */
import { onCLS, onFCP, onINP, onLCP, onTTFB, type Metric } from 'web-vitals';
import { captureEvent } from '@/lib/posthog'; // adjust to your app's PostHog wrapper

let wired = false;

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
      $current_url: window.location.href,
      $pathname: window.location.pathname,
    });
  };

  onLCP(send);
  onINP(send);
  onCLS(send);
  onFCP(send);
  onTTFB(send);
}
```

`captureEvent` is your existing PostHog wrapper. If you call `posthog.capture` directly, replace it inline.

---

## 3. Wire into bootstrap

In `src/main.tsx` (after PostHog init):

```ts
import { initPostHog } from '@/lib/posthog';
import { wireWebVitals } from '@/lib/webVitals';
// ...
initPostHog();
wireWebVitals();
```

That's it. Build + deploy. Wait 24h for enough samples (or just open the app on a phone + laptop a few times).

---

## 4. HogQL queries for Speed Insights

Add these to your `/posthog` or `/fullstatus` skill. Replace `<PROJECT_ID>` and the `POSTHOG_PERSONAL_API_KEY`.

```sql
-- p50 / p75 / p90 per metric, last 24h
select properties.metric_name name,
       count() n,
       round(quantile(0.50)(toFloat(properties.metric_value)), 2) p50,
       round(quantile(0.75)(toFloat(properties.metric_value)), 2) p75,
       round(quantile(0.90)(toFloat(properties.metric_value)), 2) p90
from events
where event = '$web_vitals' and timestamp > now() - interval 24 hour
group by name order by name

-- mobile vs desktop p75
select properties.metric_name name,
       properties.$device_type device,
       count() n,
       round(quantile(0.75)(toFloat(properties.metric_value)), 2) p75
from events
where event = '$web_vitals' and timestamp > now() - interval 24 hour
group by name, device order by name, device

-- worst pages by LCP p75 (≥ 3 samples to avoid one-off noise)
select properties.$pathname path,
       count() n,
       round(quantile(0.75)(toFloat(properties.metric_value)), 0) lcp_p75_ms
from events
where event = '$web_vitals' and properties.metric_name = 'LCP' and timestamp > now() - interval 24 hour
group by path having n >= 3 order by lcp_p75_ms desc limit 10

-- rating distribution per metric (good / needs-improvement / poor)
select properties.metric_name name, properties.metric_rating rating, count() n
from events
where event = '$web_vitals' and timestamp > now() - interval 24 hour
group by name, rating order by name, rating
```

POST each to `https://us.posthog.com/api/projects/<PROJECT_ID>/query/` with header `Authorization: Bearer <POSTHOG_PERSONAL_API_KEY>` and body `{ "query": { "kind": "HogQLQuery", "query": "<sql>" } }`.

---

## 5. Thresholds + actions (Core Web Vitals spec)

When you read the queries' output, render this verdict table:

| Metric | Good | Needs improvement | Poor | When poor — first thing to fix |
|---|---|---|---|---|
| **LCP** | ≤ 2.5 s | 2.5 – 4 s | > 4 s | Server TTFB + render-blocking JS on the slow page; lazy-load non-critical chunks; reserve image space (no late-loading hero images) |
| **INP** | ≤ 200 ms | 200 – 500 ms | > 500 ms | Long tasks in event handlers; expensive React renders; debounce inputs; move work to `requestIdleCallback` |
| **CLS** | ≤ 0.1 | 0.1 – 0.25 | > 0.25 | Images without explicit width/height; skeleton swaps not matching the real layout; fonts swapping late (use `font-display: optional`) |
| **FCP** | ≤ 1.8 s | 1.8 – 3 s | > 3 s | Reduce initial chunk size; preload critical fonts; cache HTML on edge |
| **TTFB** | ≤ 0.8 s | 0.8 – 1.8 s | > 1.8 s | Origin / cold start / DB round-trip; check server-side timing (`api_metrics` or equivalent) |

Severity for action items:

- **CRITICAL** — any p75 is in the **poor** band on >25% of mobile traffic
- **WARNING** — p75 in **needs improvement** on a high-traffic page
- **INFO** — freshly wired (<24h of data) or only a handful of samples — note it and ask for more time

---

## 6. Per-app drop-in summary

| App | Posthog wrapper to import | Bootstrap file |
|---|---|---|
| **TripKing** | `@/lib/posthog` → `captureEvent` | `src/main.tsx` after `initPostHog()` |
| **TournamentPro** | check `src/lib/posthog*` — usually `@/lib/posthog` → `captureEvent` or `posthog.capture` directly | `src/main.tsx` after PostHog init |
| **Hudr-pwa** | check `src/lib/posthog*` — usually `@/lib/posthog` → `captureEvent` or `posthog.capture` directly | `src/main.tsx` after PostHog init |

If your app calls `posthog.capture` directly instead of through a wrapper, inline that in `webVitals.ts`:

```ts
import posthog from 'posthog-js';
// ...
const send = (m: Metric) => {
  posthog.capture('$web_vitals', { /* same body */ });
};
```

---

## 7. Verify

After deploy, on the app:

1. Open it in a Chrome incognito window (so PostHog SDK uses a fresh `distinct_id`).
2. DevTools console: `posthog.opt_in_capturing(); posthog.debug();` — you'll see `$web_vitals` POSTs as you tab away.
3. PostHog UI → **Events** → filter `event = $web_vitals` — you should see LCP, FCP, INP, CLS, TTFB rows with `metric_name` / `metric_value` / `metric_rating` properties.

Then run `/posthog` (or your equivalent skill) — the Speed Insights table will populate.
