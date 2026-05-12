# Exception handling — architecture

> How every exception in TripKing is caught, classified, reported to Sentry **exactly once**, and surfaced to the user — front end *and* the Supabase edge functions.

Sentry & PostHog are wired (`VITE_SENTRY_DSN`, `SENTRY_ORG/PROJECT/AUTH_TOKEN`, `VITE_POSTHOG_*` in Vercel; `SENTRY_DSN` set as a Supabase function secret). This doc is the map; the code is under `src/lib/sentry/`, `src/components/feedback/`, `src/lib/queryClient.ts`, and `supabase/functions/_shared/`.

## The layers — "catch → classify → report-once → surface"

```
L0  Global safety net
    • Sentry.init()'s globalHandlersIntegration auto-captures uncaught errors + unhandled
      rejections; beforeSend (src/lib/sentry/init.ts) drops noise (chunk errors,
      ResizeObserver, browser-extension stacks, handled 401/404 ApiErrors)
    • src/lib/globalErrorHandlers.ts — logs uncaught errors/rejections with the [TripKing]
      prefix and breadcrumbs resource-load failures (failed <img>/<script>/CSS)
L1  React render errors
    • <ErrorBoundary> (App.tsx root)        last resort — reload fallback; ChunkLoadError → reload
    • <RouteErrorBoundary> (AppRoutes' <Suspense>, AppLayout's <Outlet/>)
                                            a broken page shows a recoverable panel; the shell/nav stay;
                                            resets on navigation
    • lazyWithRetry() (src/lib/lazyWithRetry.ts)   React.lazy that reloads on a stale-bundle chunk failure
L2  Async data — React Query is the single funnel (src/lib/queryClient.ts)
    • QueryCache.onError / MutationCache.onError → classifyError → addDataBreadcrumb →
      report-once (captureDataError, skips already-reported ApiErrors + expected 401/404) →
      optional toast.error(messageForError(error)) when meta.toastOnError is set
    • meta:{ silent:true }   — neither report nor toast (best-effort background work, e.g. geo pings)
    • meta:{ toastOnError:true } — show the friendly toast (mutations rely on this; query views render <ErrorState> instead)
    • meta:{ feature:'…' }   — override the Sentry feature tag (defaults to a tag derived from the query/mutation key)
L3  Data-layer instrumentation
    • apiClient (src/lib/api/client.ts) — a breadcrumb on every request; non-2xx (except 401/404) →
      ApiError captured with endpoint/method/status/durationMs/retryAttempt context; PostHog
      api_error / api_slow_response events
    • transforms (src/lib/api/transforms/*) — throw a typed *TransformError on a missing required field;
      reported when they bubble to the React Query funnel
    • services (src/lib/api/services/*) — unwrap() throws EmptyResponseError when a 2xx body is null;
      withErrorTracking() (src/lib/sentry/dataErrors.ts) is available for service calls that bypass React Query
L4  Imperative code — event handlers / effects / fire-and-forget
    • event handlers that touch data are wrapped in try/catch + toast.error(messageForError(e)) (see the
      pages' onSubmit/onClick handlers); the global L0 net catches anything that slips through
L5  Server — Supabase edge functions
    • withTiming() (supabase/functions/_shared/timing.ts) is the outermost wrapper: on a thrown handler it
      logs + persists a 500 to api_metrics + captureServerException() (Sentry, tags source=edge-fn fn=<name>) +
      RETURNS fail('INTERNAL', …, 500) — the client always gets the { success, error } envelope, never a raw 500
    • _shared/sentry.ts — captureServerException(): zero-dep POST of a Sentry envelope to the DSN
      (the SENTRY_DSN function secret); no-op when unset; fire-and-forget
    • _shared/codes.ts — the standard error.code set (VALIDATION/UNAUTHORIZED/FORBIDDEN/NOT_FOUND/CONFLICT/
      RATE_LIMITED/DB_ERROR/INTERNAL); fail() accepts those plus endpoint-specific strings
```

### "Report once"

Multiple layers funnel toward Sentry, so the first layer to capture an error stamps it with a non-enumerable Symbol (`src/lib/sentry/report.ts` — `markReported` / `isReported`); outer layers check `isReported` and skip. `captureDataError` marks automatically. The API client captures `ApiError`s (richest request context); the React Query caches capture everything else (transform errors, errors thrown in `select`/`queryFn`, …) and add the toast layer.

## The `src/lib/sentry/` hub

| File | What |
|---|---|
| `init.ts` | `initSentry()` — env detection (dev/preview/prod), `reactRouterV7BrowserTracingIntegration` + replay-on-error, `tracesSampleRate`, `beforeSend` noise filter. `isSentryInitialized()`. |
| `user.ts` | `setSentryUser(user)` / `clearSentryUser()` — called from `AuthContext` on login/logout; also stamps the PostHog session id as a Sentry tag. |
| `dataErrors.ts` | `captureDataError(feature, error, ctx?)`, `addDataBreadcrumb(action, ctx)`, `classifyError(error)` → 12 categories, `captureDataPerformanceIssue`, `startDataTransaction`, `withErrorTracking(feature, endpoint, fn)`, `getSentryDebugIds()`. |
| `report.ts` | `markReported(err)` / `isReported(err)`. |
| `messages.ts` | `messageForError(error)` → friendly user-facing text per category (plain English; swap for `t('errors.<category>')` when i18n lands). `ERROR_MESSAGES` map. |
| `index.ts` | Barrel — `import { … } from '@/lib/sentry'`. |

`src/lib/globalErrorHandlers.ts` (`installGlobalErrorHandlers()`, called from `main.tsx` after `initSentry()`). `src/lib/chunkError.ts` (`isChunkLoadError()`). `src/lib/lazyWithRetry.ts`.

## Adding a feature / a new error category

- A new data domain: pick a `feature` tag of the form `query:<thing>` / `mutation:<thing>` / `api:<thing>` — it's a free string; the React Query funnel derives it from the query/mutation key, the API client from the endpoint path. Pass `meta:{ toastOnError:true }` on mutations whose failures should toast.
- A new error *category*: add it to `ErrorCategory` (`dataErrors.ts`), teach `classifyError` to detect it, and add a message in `ERROR_MESSAGES` (`messages.ts`). Add a unit test.
- A new edge-function error code: use a value from `supabase/functions/_shared/codes.ts` where it fits; document new endpoint-specific codes in `public/docs/openapi.yaml` (the `ApiError` schema).

## Sentry alert rule for edge-function errors (one-time, manual)

In the Sentry UI for the `trip-king` project → **Alerts → Create Alert → Issues**:
- *When:* a new issue is created — *If:* `event.tags.source` equals `edge-fn` (and `level` equals `error`) — *Then:* notify the team (email / Slack). Optionally a second metric alert on the error *rate* for `tags.source:edge-fn`.

(Server-side events also carry `tags.fn` = the function name, and `extra` = method/path/status/request_id/stack.)

## Verifying the pipeline

There's an admin-only `debug` edge function and a "Diagnostics" card on `/administration`.

- **Front end** — on `/administration` (admin-only), the **Diagnostics** card: "Throw a render error" (→ `RouteErrorBoundary` fallback, shell stays, event in Sentry with the component stack + user id), "Reject a promise" (→ Sentry via the global hook; no white screen), "Trigger a server 500" (→ `apiClient` → `ApiError(500, "INTERNAL")` → reported + toast), "Trigger a transform error" (→ `TripTransformError` → reported + toast).
- **Edge functions** — `GET /functions/v1/debug/throw` (admin Bearer) → HTTP 500 with `{ success:false, error:{ code:"INTERNAL" } }` *and* an event in Sentry tagged `source=edge-fn fn=debug`; `GET /debug/fail?code=<CODE>` → that code with a sensible status, no Sentry event; `GET /debug/slow?ms=<n>` → sleep then 200.
- **Smoke test** — `DEBUG_API_BASE=https://<ref>.supabase.co/functions/v1 node scripts/test-error-pipeline.cjs` (it mints an admin token via the dev OTP, then asserts the above).

## Open / TODO

- A real i18n layer would replace `messageForError`'s plain strings with `t('errors.<category>')`.
- `src/lib/api/guards/` is reserved for future runtime type guards (none needed today).
- `withErrorTracking` is available but not retrofitted onto every service (the React Query funnel + apiClient reporting already cover the common path).
