---
description: TripKing PostHog — traffic, top pages, top visitors, custom events, client-side errors for the `trip-king` project (id 420735), via HogQL
---

Check PostHog analytics for the TripKing PWA. **Project:** `trip-king`, id `420735`, US cloud — API host `https://us.posthog.com` (browser ingestion is `us.i.posthog.com`; set up 2026‑05‑12). **Key:** `POSTHOG_PERSONAL_API_KEY` from `.env.development` (server-side only — NEVER ship to the browser; `VITE_POSTHOG_KEY` (`phc_…`) is the separate ingestion key).

## Step 1 — Run the HogQL queries (from a `.cjs` file, NOT inline `node -e`)

`$`, quotes and `( )` in SQL get mangled by bash, so write the script to a file. POST each query to `https://us.posthog.com/api/projects/420735/query/` with `Authorization: Bearer ${POSTHOG_PERSONAL_API_KEY}` and body `{ "query": { "kind": "HogQLQuery", "query": "<sql>" } }`; the response is `{ results: [[…row…], …], columns: [...] }`. Use a 7-day window unless noted.

```sql
-- event volume
select event, count() n from events where timestamp > now() - interval 7 day group by event order by n desc limit 25
-- daily activity (14d)
select toDate(timestamp) d, count() n, count(distinct distinct_id) u from events where timestamp > now() - interval 14 day group by d order by d
-- top pages
select properties.$pathname p, count() views, count(distinct distinct_id) visitors from events where event = '$pageview' and timestamp > now() - interval 7 day group by p order by views desc limit 20
-- top visitors
select distinct_id, count() events, countIf(event='$pageview') pv, countIf(event='$autocapture') clicks, min(timestamp) first_seen, max(timestamp) last_seen from events where timestamp > now() - interval 7 day group by distinct_id order by events desc limit 15
-- geography / device / browser
select properties.$geoip_country_name c, count() n from events where timestamp > now() - interval 7 day group by c order by n desc limit 10
select properties.$device_type d, count() n from events where timestamp > now() - interval 7 day group by d order by n desc limit 10
select properties.$browser b, count() n from events where timestamp > now() - interval 7 day group by b order by n desc limit 10
-- client-side errors / exceptions (the app may capture these as $exception or a custom api_error event)
select event, properties.endpoint, properties.status, count() n from events where event in ('$exception','api_error') and timestamp > now() - interval 7 day group by 1,2,3 order by n desc limit 25
-- rage clicks (if autocapture is on)
select count() from events where event = '$rageclick' and timestamp > now() - interval 7 day
-- custom TripKing events (anything not starting with $)
select event, count() n from events where event not like '$%' and timestamp > now() - interval 7 day group by event order by n desc limit 25

-- ── Speed Insights (Core Web Vitals via `web-vitals` → `$web_vitals` events; wired in src/lib/webVitals.ts) ──
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
-- worst pages by LCP p75 (>= 3 samples to avoid one-off noise)
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

### Web-vitals thresholds (Core Web Vitals spec — render verdict + action)

| Metric | Good | Needs improvement | Poor | Action when poor |
|---|---|---|---|---|
| **LCP** | ≤ 2.5 s | 2.5 – 4 s | > 4 s | Server TTFB + render-blocking JS; check `/metrics` for slow API on the LCP page; lazy-load non-critical chunks; reserve image space (no late-loading hero images) |
| **INP** | ≤ 200 ms | 200 – 500 ms | > 500 ms | Long tasks in event handlers; expensive React renders; debounce inputs; move work to `requestIdleCallback` |
| **CLS** | ≤ 0.1 | 0.1 – 0.25 | > 0.25 | Images without explicit width/height; skeleton swaps not matching the real layout; fonts swapping in late (use `font-display: optional`) |
| **FCP** | ≤ 1.8 s | 1.8 – 3 s | > 3 s | Reduce initial chunk size; preload critical fonts; cache HTML on edge |
| **TTFB** | ≤ 0.8 s | 0.8 – 1.8 s | > 1.8 s | Origin / cold start / DB round-trip; surface in `/metrics` (server-side `api_metrics`) and `/dbperf` |

(`posthog-js` is initialised in the PWA — `$pageview` comes from `PostHogPageviewTracker`; `$web_vitals` comes from `src/lib/webVitals.ts`.)

## Step 2 — Report

```
## TripKing PostHog — trip-king (id 420735) — [date]

### Volume (last 7d)
- Total events: X · Unique visitors: Y · Top event: Z

### Daily activity (last 14d)   [d : events / visitors — render a tiny block-char (█▆▄▂) bar of events]

### Top pages
| Path | Views | Visitors |

### Top visitors
| ID (truncated) | Events | Pageviews | Clicks | First → Last |

### Geography / Device / Browser
| Country | n |   | Device | n |   | Browser | n |

### Custom events
| Event | Count |

### Client-side errors / exceptions
| Event | Endpoint | Status | Count |

### Speed Insights (last 24h)
| Metric | p75 | Rating | Verdict |
|---|---:|---|---|
| LCP | …ms | good/ni/poor | brief diagnosis from `/metrics` if poor |
| INP | …ms | good/ni/poor | … |
| CLS | … | good/ni/poor | … |
| FCP | …ms | good/ni/poor | … |
| TTFB | …ms | good/ni/poor | … |

Mobile p75 vs Desktop p75 — flag the gap (mobile usually 2-3× worse on Indian connections).

Worst pages by LCP p75 (with ≥ 3 samples) — top 3-5 routes; the slowest is the first thing to fix.

### Notable
[rage clicks count · traffic spikes · error-event spikes · the most-hit page · anything odd]

### Action items (severity-sorted)
- **CRITICAL** when any metric p75 is in the **poor** band on >25% of mobile traffic — list the specific page + the recommended action from the threshold table above.
- **WARNING** when p75 is in the **needs improvement** band on a high-traffic page.
- **INFO** when web-vitals is freshly wired (<24h of data) or only a handful of samples — note and ask for more time.
```

If PostHog's near-empty (just `tripking_smoke_test` + a stray `$pageview`), say "freshly wired — no real traffic yet" and skip the empty tables.
