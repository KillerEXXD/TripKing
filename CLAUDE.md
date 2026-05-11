# Trip King — Claude Instructions

> ⚠️ **This file contains project credentials (Supabase keys, DB password). Keep the GitHub repo private.**

Trip King is the **development platform** for the inter-city cab & trip marketplace. It was forked from the **DriverMahal** prototype (`C:\Apps\DriverMahal` → `KillerEXXD/DriverMahal` → driver-mahal.vercel.app). DriverMahal is now the frozen sandbox; all real development happens here. The app is being moved from the prototype's mock-data state onto a real Supabase backend — see the punch list in `README.md`.

---

## Mandatory workflow — after ANY code change

```bash
npx tsc --noEmit   # must pass
npm run build      # tsc -b && vite build — must pass
npm test           # vitest (once tests exist)
```
Fix errors before considering a task complete. Path alias: `@/*` → `src/*` — use `@/...` imports, never relative `../../`.

## Code structure

Feature-folder layout — `src/features/<area>/` for screens; `src/components/` `src/lib/` `src/hooks/` `src/stores/` `src/contexts/` `src/types/` for shared infrastructure. Full map + rules in `README.md`.

**Service-layer rule:** never call `supabase` (or `fetch`) directly from pages/components. All data access goes **page → hook (`src/hooks/use*`) → `src/lib/api/services/*`** → `src/lib/supabase.ts`. Strict transforms — throw on missing required fields, no silent fallbacks (hudr-pwa pattern). `src/data/mockData.ts` is being deleted; do not import it from new code.

---

## Supabase / Database

| | |
|---|---|
| Project name | `tripking` |
| Project ref | `saxcbebqxgatiktsebxw` |
| URL | `https://saxcbebqxgatiktsebxw.supabase.co` |
| Dashboard | https://supabase.com/dashboard/project/saxcbebqxgatiktsebxw |
| Anon / publishable key (browser, RLS-scoped) | `sb_publishable_PRH2LiqnVjxAN7FYBVVQjA_TOWdFS0U` |
| Service-role / secret key | **TODO — not yet provided** (needed for admin/seed scripts) |
| Direct Postgres URL | `postgresql://postgres:DCCn6OIdwk0ENwzE@db.saxcbebqxgatiktsebxw.supabase.co:5432/postgres` |
| Postgres password | `DCCn6OIdwk0ENwzE` |

Notes:
- `db.<ref>.supabase.co` is **IPv6-only** for this project — `supabase db push` / `psql` against it fails on networks without IPv6. Use the **Connection Pooling** string from the dashboard (IPv4) instead, or the Management API (below).
- App env: `.env.development` (gitignored) has `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` + `SUPABASE_DB_URL`. `.env.example` is the template. The browser client is `src/lib/supabase.ts` (`isSupabaseConfigured` flag for graceful degradation).

### Running SQL — `scripts/db.cjs` (use this)

```bash
node scripts/db.cjs "select count(*) from public.trips"
node scripts/db.cjs --file supabase/migrations/20260512100000_init.sql
```

It POSTs to the Supabase **Management API** `POST /v1/projects/{ref}/database/query`, which runs SQL *outside a transaction* (so DDL, multi-statement files, `VACUUM`, etc. all work). 200/201 = success.

The Management API needs a **personal access token**, read at runtime from the Supabase CLI's entry in Windows Credential Manager (`Supabase CLI:supabase`, created by `npx supabase login`) via `advapi32.dll` `CredReadW` — see `scripts/db.cjs`. The token is **not stored in this repo**. If it's missing, run `npx supabase login`. (`SUPABASE_ACCESS_TOKEN` env var overrides it.)

### Migrations

- Migration files live in `supabase/migrations/<YYYYMMDDHHMMSS>_<name>.sql`.
- Apply with `node scripts/db.cjs --file supabase/migrations/<file>.sql` (the script also bumps `supabase_migrations.schema_migrations` when run via the apply helper; for single-file applies, record the version manually if you care about CLI parity — `insert into supabase_migrations.schema_migrations (version, name) values ('<ts>', '<file>')`).
- A `supabase db push` from a machine with the project `link`ed will see committed migrations as already applied.
- Schema conventions (mirroring TournamentPro/hudr): **TEXT + `CHECK` constraints, never enums** · `uuid` PKs (`gen_random_uuid()`) · **RLS enabled on every table** with explicit policies · `SECURITY DEFINER` helper fns for RLS predicates (`is_admin()`, `owns_driver(uuid)`, `owns_trip(uuid)`, `is_assigned_driver(uuid)`) to avoid recursion · `updated_at` maintained by a `set_updated_at()` trigger · indexes on every FK + common filter column · new auth users get a `public.profiles` row via the `on_auth_user_created` trigger.

### Current tables (`public.`)

`cities` · `profiles` (1:1 `auth.users`) · `drivers` · `trip_managers` · `vehicles` · `trips` (incl. `driver_bata`, `extras_paid_by_passenger`, `driver_instructions`, `posted_by_phone`, `passenger_otp`, `show_fare_to_passenger`, `hide_passenger_phone`) · `trip_acceptances` · `trip_executions` · `vacancies` + `vacancy_destinations` · `alerts` · `reviews` (manager↔driver + passenger→driver) · `notifications` · `kyc_submissions` · `app_settings` (singleton). Seeded: 10 cities, `app_settings` defaults.

---

## Supabase MCP (optional — not currently wired)

You can add the Supabase MCP server to this project with:
```
claude mcp add --scope project --transport http supabase "https://mcp.supabase.com/mcp?project_ref=saxcbebqxgatiktsebxw"
```
…but it requires an interactive OAuth flow (`claude /mcp` → authenticate) that must be done by the user in a terminal. **Claude executes SQL via `scripts/db.cjs` (the Management API), not the MCP** — no MCP setup is required for that.

---

## Key rules

1. Run `npx tsc --noEmit` + `npm run build` after every change.
2. Service-layer only — no `mockData` / `supabase` imports in pages/components.
3. Strict transforms — throw on missing required fields, no fallback calculations.
4. Run SQL via `node scripts/db.cjs ...` (Management API). Don't rely on `supabase db push` against the direct DB host (IPv6).
5. `@/*` path alias; feature folders under `src/features/`.
6. Add a regression test (Vitest) with bug fixes and new pure logic — start with the payout math, the alert matcher, and the API transforms.
7. Keep this repo private — it carries the project credentials above.
