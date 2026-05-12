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
select event, properties.endpoint, properties.status, count() n from events where event in ('$exception','api_error','$web_vitals') and timestamp > now() - interval 7 day group by 1,2,3 order by n desc limit 25
-- rage clicks (if autocapture is on)
select count() from events where event = '$rageclick' and timestamp > now() - interval 7 day
-- custom TripKing events (anything not starting with $)
select event, count() n from events where event not like '$%' and timestamp > now() - interval 7 day group by event order by n desc limit 25
```

(`posthog-js` is initialised in the PWA — `$pageview` comes from the `PostHogPageviewTracker` component; `$autocapture`/`$rageclick` depend on whether autocapture is on. Handle "no rows" gracefully.)

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

### Notable
[rage clicks count · traffic spikes · error-event spikes · the most-hit page · anything odd]
```

If PostHog's near-empty (just `tripking_smoke_test` + a stray `$pageview`), say "freshly wired — no real traffic yet" and skip the empty tables.
