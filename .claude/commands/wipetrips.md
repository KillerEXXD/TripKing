---
description: Wipe trip data on QA. Two scopes — full reset (also wipes notifications/vacancies/alerts/passengers) or trips-only (just trips + FK cascades). Researches the live schema first (new tables / FKs may have landed), confirms scope, then executes — pre-flight counts → SQL transaction → cache-epoch bumps → redeploy → Cloudflare purge → PR.
---

Wipe trip data on QA (`saxcbebqxgatiktsebxw`) so the team starts fresh. **DO NOT skip the research step** — new tables / FKs / status values may have been added since the SQL files were last edited, and the wipe must cover them or you'll leave orphan rows.

## Scope decision (resolve before touching anything)

Two SQL files are checked in. Pick one based on what the user wants — if `$ARGUMENTS` says "narrow" / "only trips" / "preserve notifications", use the narrow one; otherwise default to full reset.

| File | Wipes | Preserves (in addition to identity / reference / operational tables) |
|---|---|---|
| **`scripts/reset-trips-qa.sql`** (full reset — PR #89's original) | `trips` + 5 FK cascades + `notifications` + `vacancies` (incl. `vacancy_destinations`) + `alerts` + `passengers` | — |
| **`scripts/reset-trips-only.sql`** (narrow scope) | `trips` + 5 FK cascades only (`trip_acceptances`, `trip_invitations`, `trip_waypoints`, `trip_executions`, `reviews`) | `notifications` / `vacancies` / `alerts` / `passengers` |

Cache-epoch bumps depend on scope: bump **trips** for either; bump **vacancies** only on the full reset (narrow scope doesn't touch vacancies). CF purge follows the same rule — purge `/trips` for either, `/vacancies` only for full reset.

## Step 1 — research the live schema (BLOCKING)

Run these read-only queries before touching anything. They tell you what's actually wipeable right now, not what was wipeable last time:

```bash
# (a) Every child table of public.trips and its ON DELETE rule
node scripts/db.cjs "select tc.table_name as child, kcu.column_name, rc.delete_rule from information_schema.table_constraints tc join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name join information_schema.referential_constraints rc on tc.constraint_name = rc.constraint_name join information_schema.key_column_usage kcu_pk on rc.unique_constraint_name = kcu_pk.constraint_name where tc.constraint_type = 'FOREIGN KEY' and kcu_pk.table_name = 'trips' and tc.table_schema = 'public' order by child"

# (b) Trip-adjacent tables that have NO FK to trips but logically should be wiped
#     (notifications, vacancies, alerts, passengers, anything with 'trip' in the name)
node scripts/db.cjs "select table_name from information_schema.tables where table_schema = 'public' and (table_name ilike '%trip%' or table_name in ('notifications','vacancies','vacancy_destinations','alerts','passengers')) order by table_name"

# (c) Children of vacancies / alerts / passengers / notifications (cascade story for adjacent wipes)
node scripts/db.cjs "select tc.table_name as child, kcu_pk.table_name as parent, rc.delete_rule from information_schema.table_constraints tc join information_schema.key_column_usage kcu on tc.constraint_name = kcu.constraint_name join information_schema.referential_constraints rc on tc.constraint_name = rc.constraint_name join information_schema.key_column_usage kcu_pk on rc.unique_constraint_name = kcu_pk.constraint_name where tc.constraint_type = 'FOREIGN KEY' and kcu_pk.table_name in ('vacancies','alerts','passengers','notifications') and tc.table_schema = 'public' order by parent, child"

# (d) Current row counts (this is your pre-flight snapshot too)
node scripts/db.cjs "select 'trips' as t, count(*) from public.trips union all select 'trip_acceptances', count(*) from public.trip_acceptances union all select 'trip_invitations', count(*) from public.trip_invitations union all select 'trip_waypoints', count(*) from public.trip_waypoints union all select 'trip_executions', count(*) from public.trip_executions union all select 'reviews', count(*) from public.reviews union all select 'notifications', count(*) from public.notifications union all select 'vacancies', count(*) from public.vacancies union all select 'alerts', count(*) from public.alerts union all select 'passengers', count(*) from public.passengers"
```

Compare what (a) + (b) return against the `DELETE FROM` list in `scripts/reset-trips-qa.sql`. **If anything is missing — a new child table of `trips`, a new top-level `trip_*` table, a new adjacent feature table not yet in the script — STOP and either add it to the SQL or ask the user.** Common signals:
- A migration added a new `trip_*` table (e.g. `trip_chat_messages`, `trip_ratings_v2`) without a CASCADE → orphan rows after the wipe.
- The status enum gained / dropped a value — irrelevant to the wipe but worth noting in the post-flight report.
- A new entity (e.g. `bookings`, `dispatches`) was introduced that should logically reset alongside trips.

If the schema is unchanged → re-use `scripts/reset-trips-qa.sql` as-is.

## Step 2 — confirm scope with the user

Echo back the research output (one short table) and the wipe scope you're about to execute. Ask **only** if the schema research surfaced something new — otherwise proceed.

Defaults (set by the original wipe; the SQL in the repo reflects them):
- ✅ Wipe: `trips` + all CASCADE children, `notifications`, `vacancies`, `alerts`, `passengers`
- ❌ Preserve: `users`, `drivers`, `trip_managers`, `vehicles`, `auth.users`, KYC docs, admin reference data, `api_metrics`, `rate_limits`, `admin_audit_log`, `video_verifications`, `bug_reports`

## Step 3 — branch off `origin/main`

```bash
git fetch origin main
git checkout -b chore/reset-qa-trips-$(date +%Y-%m-%d) origin/main
```

## Step 4 — update the SQL (only if research surfaced new tables)

`scripts/reset-trips-qa.sql` is the single source of truth. If new tables / FKs were found in step 1, add the relevant `DELETE FROM public.<table>;` lines AND a matching assertion inside the final `DO $$ … END $$` block (which raises if any counter isn't 0, rolling back the whole transaction). Keep the order: CASCADE-parent first, sibling tables after.

## Step 5 — bump the cache epochs

Edit two files:

- `supabase/functions/trips/index.ts` — find `const CACHE_EPOCH = 'vN'` (around line 55) and increment N. Append a comment line above it: `// v<N+1> (<today>): bumped after the QA-data reset wipe.`
- `supabase/functions/vacancies/index.ts` — same pattern (around line 37).

The increment matters: this is what drops every cached entry cluster-wide.

## Step 6 — execute the wipe

```bash
# Pre-flight (matches step 1d but printed alongside post-flight for the PR body)
node scripts/db.cjs "select 'trips' as t, count(*) from public.trips union all select 'trip_acceptances', count(*) from public.trip_acceptances union all select 'trip_invitations', count(*) from public.trip_invitations union all select 'trip_waypoints', count(*) from public.trip_waypoints union all select 'trip_executions', count(*) from public.trip_executions union all select 'reviews', count(*) from public.reviews union all select 'notifications', count(*) from public.notifications union all select 'vacancies', count(*) from public.vacancies union all select 'alerts', count(*) from public.alerts union all select 'passengers', count(*) from public.passengers"

# Wipe (single transaction; rolls back if any final-assertion counter isn't 0)
node scripts/db.cjs --file scripts/reset-trips-qa.sql

# Post-flight — every row must be 0
node scripts/db.cjs "select 'trips' as t, count(*) from public.trips union all select 'trip_acceptances', count(*) from public.trip_acceptances union all select 'trip_invitations', count(*) from public.trip_invitations union all select 'trip_waypoints', count(*) from public.trip_waypoints union all select 'trip_executions', count(*) from public.trip_executions union all select 'reviews', count(*) from public.reviews union all select 'notifications', count(*) from public.notifications union all select 'vacancies', count(*) from public.vacancies union all select 'alerts', count(*) from public.alerts union all select 'passengers', count(*) from public.passengers"
```

If any post-flight count isn't 0, the SQL is missing a DELETE or the assertion missed a table. Fix and re-run.

## Step 7 — redeploy edge functions

```bash
npx supabase functions deploy trips vacancies --use-api --project-ref saxcbebqxgatiktsebxw
```

(If the research in step 1 surfaced a new edge function that also caches trip-shaped responses, deploy it too.)

## Step 8 — purge Cloudflare

```bash
# .env.development holds CLOUDFLARE_PURGE_TOKEN + CLOUDFLARE_ZONE_ID
set -a && . ./.env.development && set +a
node scripts/cloudflare-purge.cjs \
  https://api.tripkingapp.com/functions/v1/trips \
  https://api.tripkingapp.com/functions/v1/vacancies
```

Expect output: `Purged 2 URL(s) — <cf-job-id>`.

## Step 9 — commit + push + open PR

```bash
git add -A
git commit -m "chore(qa): wipe trips + adjacent data on QA + bump trip/vacancy CACHE_EPOCH"
git push -u origin chore/reset-qa-trips-<date> --no-verify
```

`--no-verify` is acceptable here because the changes are SQL + 2-line cache-epoch bumps; the pre-push gate's baseline test failures (per PR #67's note) are unrelated.

Open a PR via `mcp__github__create_pull_request` with:
- Title: `chore(qa): wipe trips + adjacent data on QA + bump trip/vacancy CACHE_EPOCH`
- Body: a before-→-after table (pre-flight vs post-flight counts), the CF job id, the list of preserved tables. Mirror PR #89's format.

## Step 10 — report

Output a concise summary:
- N rows wiped across M tables (with the per-table breakdown)
- Cache epochs new values
- CF purge job id
- PR URL

## Guardrails

- **DO NOT** edit any `supabase/migrations/*.sql` file as part of this skill — the wipe is a one-off data op, not a schema change.
- **DO NOT** wipe `users` / `auth.users` / `drivers` / `trip_managers` / `vehicles` / admin reference data. If the user asks for that, push back: it's a separate operation with different blast radius (deactivates everyone's logins).
- **DO NOT** skip step 1's schema research even if the script "looks fine." Schema drift is exactly how partial wipes / orphan rows happen.
- The wipe is irreversible without Supabase PITR. If the SQL transaction's assertion-block raises, nothing committed — that's the safety net; trust it.
