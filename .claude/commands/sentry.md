---
description: TripKing Sentry — unresolved issues for the `trip-king` project (hudr org), categorised, with high-impact details; auto-resolve clearly synthetic/transient ones
---

Check Sentry for the TripKing frontend. **Project:** org `hudr`, slug `trip-king` (id `4511377634951168`, platform `javascript-react`, set up 2026‑05‑12). **Token:** `SENTRY_AUTH_TOKEN` from `.env.development` (the `hudr`-org admin "claude-token") — never hardcode it.

## Step 1 — Unresolved issues (last 14d)

Write a small `.cjs` (or inline Node) that reads `.env.development` and hits the Sentry API:

```js
require('dotenv').config({ path: '.env.development' });
const ORG = process.env.SENTRY_ORG, PRJ = process.env.SENTRY_PROJECT, TOK = process.env.SENTRY_AUTH_TOKEN;
// GET https://sentry.io/api/0/projects/{ORG}/{PRJ}/issues/?query=is:unresolved&statsPeriod=14d&limit=25
//   headers: { Authorization: `Bearer ${TOK}` }
```

For each issue capture: `level`, `count` (events), `userCount`, `culprit` / `metadata.type` / `metadata.value`, `title`, `firstSeen`, `lastSeen`, `permalink`. (If the token 403s, fall back to the `sntryu_…` admin token in `C:/Apps/TournamentPro/CLAUDE.md` — same `hudr` org.)

## Step 2 — Categorise & investigate

Bucket each issue:
- **synthetic/test** — title contains "smoke test" / "synthetic" / "safe to delete" (the verification events). Resolvable.
- **network/timeout** — fetch failed, `NetworkError`, `AbortError`, `TypeError: Failed to fetch`, timeout. Often transient (offline / flaky network).
- **data/parse** — JSON parse errors, `*TransformError` (`handTransform` etc.), schema mismatches → usually an **API contract issue** — note it for the backend lane.
- **client** — `TypeError`, "cannot read property of undefined", render/hook errors → a frontend bug.
- **server** — a 5xx surfaced in the browser (the response was an error envelope) → an edge-function issue.

For any **high-impact** issue (>5 events or >2 users): `GET https://sentry.io/api/0/issues/{ID}/events/?limit=3` → pull the stack frames, the `request` context (URL/method), `breadcrumbs`, `tags` (browser, release, user, environment). Tie it to a concrete root cause + fix.

## Step 3 — Resolve the obviously-safe ones (only)

A clearly synthetic test issue (e.g. "TripKing Sentry smoke test #N", "synthetic — safe to delete") → `PUT https://sentry.io/api/0/issues/{ID}/` with `{"status":"resolved"}`. A truly transient one with 1 event / 1 user and an obviously-environmental cause (offline) — judgement call, lean toward resolving. **Never** resolve a real recurring error — surface it.

## Step 4 — Report

```
## TripKing Sentry — trip-king (hudr) — [date]

| Bucket | Issues | Events | Users |
|--------|--------|--------|-------|
| synthetic/test | … | … | … |
| network/timeout | … | … | … |
| data/parse | … | … | … |
| client | … | … | … |
| server | … | … | … |

### Unresolved issues (last 14d)
| Level | Events | Users | Title | Last seen | Link |

### High-impact details
[per >5-event / >2-user issue: stack summary · request context · likely cause · the fix · whose lane (frontend vs an API contract → backend)]

### Resolved this run
[synthetic/transient issues auto-resolved, with their IDs — or "none"]

### Assessment
[OK if 0 real issues. If Sentry's near-empty (just the smoke event), say "freshly wired — no real errors yet". Else: "X real issues — Y need a fix" + the top one.]
```
