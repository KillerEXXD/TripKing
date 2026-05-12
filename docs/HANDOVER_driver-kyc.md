# Handover — TripKing "driver onboarding & KYC verification" feature

> Working doc for resuming the `feat/driver-kyc` branch in a fresh session. Paste-ready.
> Delete this file when the branch merges (its content gets folded into `docs/CONTINUE_HERE.md` + CLAUDE.md §9).

## Context
Building the driver **"Get verified" onboarding flow**. A driver signs up (phone OTP + name) and can browse, but can't apply to / post trips until `kyc_status='approved'` — which requires identity docs (Aadhaar f/b, driving licence, selfie), a registered vehicle (+ photos: front/back/sides/number-plate + RC + insurance), and a video-call verification. The UX is a **non-blocking checklist**: a banner on the driver home + a 5-step checklist on `/profile`, each step its own screen, resumable. Full plan + design + work breakdown: `~/.claude/plans/why-not-connected-to-wise-lake.md` (read it first; it has a "Progress" section).

## Where the work lives
- **Worktree `c:/Apps/TripKing-kyc` on branch `feat/driver-kyc`** — all the work is here, pushed to origin (10 commits). `node_modules` is installed in this worktree.
- The main checkout `c:/Apps/TripKing` stays clean on `main` (except `.mcp.json`, which has an unrelated MCP-config fix sitting modified — leave it).
- A **parallel session** is on `feat/places-frontend` (maps/locations: `*_place_id`, near-me/within-N-km feed filters, "pin exact spot"). **Only overlap with this branch:** `supabase/functions/{trips,vacancies}/index.ts` — they add `*_place_id` handling, we added a `KYC_REQUIRED` gate at the top of the POST handlers → different code regions, clean git merge; whoever rebases second must **re-deploy those two functions**. We also edited `PostVacancyPage.tsx` / `PostTripPage.tsx` for the gate (they edit those too — expect a small conflict).

## Done & pushed (`feat/driver-kyc`, 10 commits — every push passed the Husky gate: tsc + ~341 tests + build)
| hash | what |
|---|---|
| `53782a3` | migrations 007–010 — `drivers`/`trip_managers` KYC-doc columns; `video_verifications` + `video_call_availability` (+ RLS); 4 private Storage buckets (`driver-kyc`/`manager-kyc`/`vehicle-photos`/`video-recordings`) + `storage.objects` RLS; `vehicles.photo_plate_url`. **Applied to the project.** |
| `89c4b96` | `drivers` edge fn — server-computed `verification` block on `GET /drivers/me`; `POST /drivers/:id/kyc-doc-upload-url`, `POST`/`GET /drivers/:id/kyc-docs`; `PATCH /drivers/:id/kyc` records reviewer/at/reason; private KYC fields stripped from public reads |
| `7fca12a` | `agents` fn (manager KYC mirror — Aadhaar+selfie, no DL); `vehicles` fn `POST /vehicles/:id/photo-upload-url`; **new `video-verifications` fn** (`GET /available-slots`, `POST /` book→`video_pending`+Jitsi url, `GET/PATCH /:id` cancel/reschedule, admin `GET /?status=&from=&to=`, admin `PATCH /:id/finalize`→`approved`+`kyc_status_change` notification); `KYC_REQUIRED` 403 on `POST /trips`,`/trips/:id/applicants`,`/vacancies`; `scripts/test-kyc-flow.cjs` (25/25 green) |
| `4668ed4` | frontend data layer — `src/types/{videoVerification.ts,driver.ts (+VerificationSummary,KycDocs,…),vehicle.ts (+photoPlateUrl,VehiclePhotoSlot)}`; transforms (+tests); `src/lib/api/upload.ts` (canvas image-compress + signed-URL PUT — **no new dep**); services (`getDriverKycDocUploadUrl`/`submitDriverKycDocs`/`getDriverKycDocs` + agent trio; `getVehiclePhotoUploadUrl`; new `videoVerifications.ts`); hooks (`useSubmitDriverKycDocs`, `useDriverKycDocs`, new `useVideoVerification.ts`); `<FileUpload>` (`src/components/form/`) |
| `c697e95` | `<DriverVerificationChecklist>` + `<GetVerifiedBanner>` + `verificationSteps.ts` (`src/components/driver/`); pages `/verify/documents`, `/vehicles/new`+`/vehicles/:id/edit`, `/vehicles/:id/photos`, `/verify/video-call` (+ routes in `AppRoutes.tsx`); ProfilePage mounts the checklist (`#get-verified` anchor) + reworked vehicles card; DriverHomePage mounts the banner |
| `302382e` | admin **Video Call Console** `/administration/video-calls` (3-gate finalize → `kyc_status=approved`) + nav link + route |
| `76020ae` | Apply-to-trip bar gate ("Get verified to apply →") + regression test |
| `5e035ba` | "Get verified" slide in the onboarding carousel (driver & agent) |
| `0d4f708` | `<KycGateNotice>`; `PostVacancyPage` & `PostTripPage` show it instead of the form when not approved; + tests; + an "In flight" handoff section in `docs/CONTINUE_HERE.md` |
| `c840a27` | KYC document viewer in `KycReviewPage` (toggle per row → fetches `GET /drivers|agents/:id/kyc-docs` → thumbnails of Aadhaar f/b / DL / selfie + masked numbers) |

## REMAINING (do these next, roughly in order)
1. **OpenAPI** — add the ~10 new endpoints (`/drivers/me` verification block; `kyc-doc-upload-url`; `kyc-docs` POST/GET; `/agents/*` mirrors; `/vehicles/:id/photo-upload-url`; the `/video-verifications/*` set) to `public/docs/openapi.yaml` **and** `public/docs/openapi.json`, plus k6 entries.
2. **Playwright E2E** — driver journey: sign in → see the Home banner → `/verify/documents` upload → `/vehicles/new` + `/vehicles/:id/photos` → `/verify/video-call` book → (admin) `/administration/video-calls` finalize → driver sees "Verified ✓", Apply unlocked, a `kyc_status_change` notification. See the existing `e2e/` folder for the pattern.
3. **Fold the docs** (after the branch merges) — move the "In flight" block in `docs/CONTINUE_HERE.md` into the main "State" section, add a line to CLAUDE.md §9 "Delivery phases — status", and delete this file. (Conflict-risky to touch CLAUDE.md before merge — wait.)
4. **(optional)** Agent-facing KYC screens — backend + admin side cover trip-managers, but the *driver* screens are driver-only. A thin agent variant of `/verify/documents` (no DL) + `/verify/video-call`.
5. Then **open the PR**: `gh pr create --base main --head feat/driver-kyc`.

## Commands (run from `c:/Apps/TripKing-kyc`)
```bash
npm run typecheck            # tsc --noEmit
npm run test:run             # vitest run (~341 tests)
npm run build                # tsc && vite build
npm run lint                 # eslint — note: 5 PRE-EXISTING react-refresh warnings (not ours); --max-warnings 0 fails on them. The push gate uses tsc+test:run+build (NOT lint), so pushes are fine.
git push                     # runs the Husky pre-push gate (tsc + test:run + build)

# DB / migrations (Management API; token from the Supabase CLI Windows Credential Manager):
node scripts/db.cjs "select column_name from information_schema.columns where table_name='drivers'"
node scripts/db.cjs --file supabase/migrations/<NNN>_<name>.sql

# Deploy an edge fn (project ref saxcbebqxgatiktsebxw):
npx supabase functions deploy <name> --project-ref saxcbebqxgatiktsebxw --no-verify-jwt

# Smoke test the whole KYC flow against the deployed fns:
KYC_API_BASE=https://saxcbebqxgatiktsebxw.supabase.co/functions/v1 node scripts/test-kyc-flow.cjs
```

## Gotchas / decisions already made
- **Video provider** = Jitsi public rooms (`https://meet.jit.si/tripking-<verification_id>`) — no API key. Swap later (the spec mentions Daily/Meet).
- **"name plate" photo** = the registration number-plate close-up (one slot, `photo_plate_url`). Add a separate chassis/VIN-plate slot if that's wanted.
- **i18n isn't actually wired up** in TripKing (the dep is installed but no config/locale files) — use plain English strings, matching the rest of the codebase. The CLAUDE.md "i18n from day one" rule is aspirational.
- KYC-doc storage: the DB columns hold the **object path** (not a URL); the edge fn mints 5-min signed download URLs and short-lived signed upload URLs. The browser PUTs bytes straight to Storage via the signed URL (`src/lib/api/upload.ts`) — never proxies through the function, never uses the Supabase client (rule §1).
- `kyc_status` flow: `pending → docs_submitted` (after `POST .../kyc-docs`) → `video_pending` (after booking) → `approved`/`rejected`/`resubmit_required` (after admin `finalize` or `PATCH .../kyc`). A `kyc_status_change` notification fires on every admin transition.
- The `verification` block (steps `details`/`documents`/`vehicle`/`vehicle_photos`/`video_call`, each `todo|done|action_needed|scheduled`, + `steps_done/steps_total`, `video_verification`, `kyc_rejection_reason`) is **computed server-side** in the `drivers`/`agents` fns and only returned on `GET /me` + admin views — the UI just renders it (no business logic in the browser). Agents have 3 steps; drivers have 5.
- `/auth/request-otp` is still a DEV placeholder (no real SMS) — out of scope, separate prerequisite.

**First move in a fresh session:** read `~/.claude/plans/why-not-connected-to-wise-lake.md`, then `cd c:/Apps/TripKing-kyc`, `git log --oneline -12` to confirm you're on `feat/driver-kyc` at `c840a27`, and start with the OpenAPI update.
