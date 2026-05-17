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

## Step 3 — Stale-fix cross-check (do this BEFORE Step 4)

A surprisingly common case in this repo: an issue surfaces in the report but the underlying bug was already fixed and the issue's `lastSeen` predates the fix. Surfacing it as CRITICAL wastes the reader's attention. For EVERY non-trivial issue, do this check:

1. Map the issue to its source area:
   - `*TransformError` / `MISSING_FIELD` → `src/lib/api/transforms/<resource>.ts` + the matching `supabase/functions/<resource>/`
   - `TypeError: Cannot read … of undefined` in a named component → that file under `src/`
   - `ReferenceError: X is not defined` in an edge fn → that `supabase/functions/<fn>/index.ts`
   - `ApiError: <copy>` → grep `supabase/functions/` for the copy
2. Find the most recent commit touching that file: `git log --since="<lastSeen - 1 day>" --oneline -- <path>`
3. If a fix-shaped commit (`fix(...)`, "silence", "guard", "fallback", "filter", "skip") landed AFTER `lastSeen` → the issue is **stale**. Resolve it (Step 4 below) with a comment citing the commit. Don't surface it in the report's main "needs fix" section — move it to "Auto-resolved (stale)".
4. Also cross-check `api_metrics` (`select created_at, status from api_metrics where endpoint=<fn> and status>=500 order by created_at desc limit 5`) — if zero 500s in the last 24h on the relevant endpoint, the issue is almost certainly cleared.

The point: **stop reporting fixed-by-shipped-code as live problems.** A real recurring bug fires new events; the absence of events since the fix is your signal.

## Step 4 — Resolve the obviously-safe ones (only)

Auto-resolve in these cases:
- **synthetic / test** — title contains "smoke test" / "synthetic" / "safe to delete".
- **user-error 4xx surfaced** — 401 / 403 / 404 / 409 / 422 / 429 that snuck past the queryClient/apiClient filter (these are now silenced going forward via commit 0b65cf3, but historical events still need cleanup).
- **stale** (per Step 3) — fix landed after `lastSeen` and no new events.
- **third-party / not-our-code** — Vercel toolbar errors (`/_next-live/feedback/*`), browser-extension noise.
- **truly transient** — 1 event / 1 user with an obviously-environmental cause (offline). Judgement call.

**Never** resolve a real recurring error — surface it.

### API calls (verified working — `/sentry` doc had wrong shapes that 400/403'd before)
- **Resolve**: `PUT https://sentry.io/api/0/organizations/hudr/issues/?id=<ID>` body `{"status":"resolved"}` header `Authorization: Bearer <SENTRY_AUTH_TOKEN>`. (The documented `PATCH /api/0/issues/<ID>/` returns 403 on this token; the org-scoped PUT works.)
- **Comment**: `POST https://sentry.io/api/0/issues/<ID>/comments/` body `{"text":"<message>"}` — top-level `text`, NOT `{"data":{"text":...}}`. Use Python's `json.dumps` or a single-quoted heredoc — Windows shells mangle UTF-8 (em-dash `—` becomes garbage); stick to ASCII `-` in comment bodies.

## Step 5 — Report

```
## TripKing Sentry — trip-king (hudr) — [date]

| Bucket | Issues | Events | Users |
|--------|--------|--------|-------|
| synthetic/test | … | … | … |
| network/timeout | … | … | … |
| data/parse | … | … | … |
| client | … | … | … |
| server | … | … | … |
| stale (fixed, awaiting Sentry resolution) | … | … | … |

### Unresolved + LIVE issues (last 14d) — only ones that recurred AFTER the most-recent area fix
| Level | Events | Users | Title | Last seen | Most-recent fix to area | Status | Link |

### Stale (auto-resolved this run)
[issues whose lastSeen predates the area's most-recent fix commit — with the commit hash + sha]

### High-impact details (LIVE only)
[per >5-event / >2-user LIVE issue: stack summary · request context · likely cause · the fix · whose lane (frontend vs an API contract → backend)]

### Resolved this run
[synthetic/transient/stale issues auto-resolved, grouped by reason, with their IDs — or "none"]

### Assessment
[OK if 0 LIVE issues. If Sentry's near-empty (just the smoke event), say "freshly wired — no real errors yet". Else: "X LIVE issues — Y need a fix" + the top one.]
```
