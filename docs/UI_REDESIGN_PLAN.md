# TripKing UI Redesign — Broad Architectural Plan

> Status: **approved, not yet started**. Owner: Ravee. Target: full-app restyle to a single design system.
> This document is the durable record of the redesign approach. The original ad-hoc spec (Home / Vacancies / Post-a-trip / My posts) is captured here as a system rather than four page restyles.

## Context

We need a consistent modern look across the four core pages (Home, Vacancies, Post-a-trip, My posts) and a system that scales to every other page (KYC, admin, video calls, vehicle, onboarding, referral & bonus) without each one re-inventing styles.

The spec we received is a **design system**, not four separate page restyles. We treat it that way: define the system **once** (tokens + primitives + composition components), then have pages **consume** it. If we instead bolt the spec onto each page inline, we'd ship ~1500 lines of near-duplicate Tailwind utilities, drift within a sprint, and pay the same cost again for every new page.

Current state:
- Tailwind v4, design tokens in `src/index.css` `@theme` block (already centralized — good)
- `<Button>`, `<Card>`, `<Badge>` exist as CVA-based primitives (good — extend, don't replace)
- **Page headers are inline `<header>` tags in every page** (bad — biggest source of drift; first thing to fix)
- HomePage tile colors are inline `bg-emerald-100` etc. (scattered)
- `<PriorityCard tone=…>` is the cleanest existing pattern — template for how new pieces should look

---

## Guiding principles

1. **Tokens > utilities > components**. A color/radius/shadow appears in *one* file. Pages never write hex codes.
2. **One header component, every page**. Inline `<header>` JSX is the #1 source of inconsistency — kill it first.
3. **Extend, don't fork** the existing CVA primitives (`Button`, `Badge`, `Card`). Add variants; don't add a parallel set.
4. **No `!important`**. Tailwind v4 + properly-scoped component classes don't need it. The spec's note about `!important` is a workaround we shouldn't need.
5. **Page files shrink, not grow**. After redesign, `VacanciesPage.tsx` should have *fewer* style classes than today, not more.

---

## Architecture — 4 layers

### Layer 1 — Design tokens (`src/index.css`)
Single source of truth. Extend the existing `@theme` block:

- **Surface tokens**: `--color-page` (#f0f2f5), `--color-surface` (#fff), `--color-surface-muted` (#f9fafb), `--color-surface-priority` (#1a1a1a)
- **Accent palette tokens**: green/amber/blue/purple in `-accent` / `-accent-light` pairs (matches the spec's left-border accent pattern on home cards)
- **Elevation tokens**: `--shadow-card` (0 2px 12px rgba(0,0,0,0.06)), `--shadow-header` (0 1px 0 …), `--shadow-fab` (0 4px 14px rgba(16,185,129,0.4)), `--shadow-footer` (0 -4px 16px …)
- **Radius tokens**: `--radius-card` (16px), `--radius-control` (10–12px), `--radius-pill` (20px)
- **Typography scale tokens** for the recurring sizes (header 17px, section-label 10px+uppercase, body 14px, micro 11px)

Nothing in pages should reference hex codes or `rounded-[16px]` arbitrary values after this — only `bg-surface`, `shadow-card`, `rounded-card` etc.

### Layer 2 — Reusable composition components

These are the "missing pieces" that cause the duplication today:

| Component | Replaces (today) | Used by |
|---|---|---|
| `<PageHeader title subtitle backTo right>` | Inline `<header>` in every page | All pages |
| `<PageShell>` (bg-page, padding-bottom for bottom nav, max-w-md centering) | Each page setting its own `<main>` classes | All pages |
| `<SectionCard accent="green\|amber\|blue\|purple\|grey">` | HomePage's 5 colored tiles | HomePage, future dashboards |
| `<SectionLabel>` | Inline `text-[10px] uppercase tracking-wider` | Form sections, dashboards |
| `<StickyFooterCTA>` | PostVacancyPage's footer | Post trip, any 2-step flow |
| `<FilterPill>` / `<FilterBar>` | Inline select styling in VacanciesPage | Vacancies, future filtered lists |
| `<ProgressBar value max>` | New | Post-a-trip step indicator |
| `<SegmentedTabs>` | Inline tab strips | Trip type tabs, status filter tabs |

Each component lives in **one file**, exports a typed props interface, takes children where it makes sense, and accepts a `className` for the rare override.

### Layer 3 — Extended existing primitives
Don't fork. **Add variants** to what's already there:

- `<Badge>` — add `status` variant set: `open`, `invited`, `verified`, `completed`, `live` (the Section 1.7 styles).
- `<Button>` — confirm `default` matches the spec's primary CTA; add `ghost-green` if needed for the Section 1.9 secondary style.
- `<Card>` — the spec's "White Card Style" is essentially the current `<Card>` with adjusted shadow/radius. Update its base classes in the primitive file once; every consumer gets it for free.
- `<Input>`, `<Select>` — apply the Section 1.10 form input styling in the primitive, not per-page.

### Layer 4 — Pages
Pages become thin. They:
- Wrap in `<PageShell>`
- Use `<PageHeader title="Vacant drivers" subtitle="N vacant drivers" backTo="/" />`
- Compose `<SectionCard>`, `<Badge variant="open">`, `<FilterBar>` etc.
- Hold **only page-specific layout** (the driver row's internal flex, etc.) — no global styling decisions.

After this, the page diffs are mostly **deletions** + a handful of new component usages.

---

## Execution sequence (one PR each)

The order matters — each phase unlocks the next without breaking what's shipped.

### PR 1 — Tokens & primitive updates (foundational, no visual page changes yet)
- Extend `src/index.css` `@theme` with surface/accent/elevation/radius tokens
- Update `<Card>`, `<Badge>`, `<Button>`, `<Input>` primitive base classes
- Add the `status` Badge variants
- **Outcome:** pages look slightly more consistent because primitives changed. No page files touched.

### PR 2 — Shared layout components
- Add `<PageShell>`, `<PageHeader>`, `<SectionLabel>`, `<StickyFooterCTA>`, `<FilterBar>`/`<FilterPill>`, `<SegmentedTabs>`, `<ProgressBar>`, `<SectionCard>`
- Each gets a `__tests__/` file (rule in CLAUDE.md — non-negotiable)
- **Outcome:** building blocks ready. Still no page changes.

### PR 3 — VacanciesPage redesign (proof of concept)
- Convert one page first. Most self-contained, clearest spec.
- Validates the primitives in real use; surfaces any missing pieces before committing to all four.

### PR 4 — PostedTripsPage redesign (exercises `<SegmentedTabs>` + status badges)

### PR 5 — PostVacancyPage redesign (exercises `<StickyFooterCTA>` + `<ProgressBar>` + `<SectionCard>`)

### PR 6 — HomePage redesign (composition-heavy — exercises `<SectionCard accent=…>`)

### PR 7 — Full-app sweep (split for review size)
Mechanical: replace inline `<header>` with `<PageHeader>`, swap inline tile backgrounds for `<SectionCard accent=…>`, swap inline status pills for `<Badge variant>`.

- **PR 7a** — KYC + onboarding pages
- **PR 7b** — Admin module (`/administration/*`)
- **PR 7c** — Vehicle + video-call pages
- **PR 7d** — Referral & bonus — `ReferralsPage`, `ReferralLinkDetailPage`, and the 5 referral components (`ReferralCodeCard`, `EarningsTimelineChart`, `ReferredUserTable`, `TransferToWalletPanel`, `WithdrawalCard`). These pages currently have **no `<header>`** at all, so this PR wires them onto `<PageHeader>` for the first time. `ReferralCodeCard` adopts the dashed-code-box style; `WithdrawalCard` / `TransferToWalletPanel` become `<SectionCard>` consumers; `EarningsTimelineChart` keeps its recharts internals but its frame becomes the standard card.
- Final visual pass: `grep src/pages -r '<header'` returns zero.

---

## Critical files

**Will change (small, scoped edits):**
- `src/index.css` — token additions (PR 1)
- `src/components/ui/{card,badge,button,input}.tsx` — variant additions (PR 1)
- `src/pages/{Home,Vacancies,PostVacancy,PostedTrips}Page.tsx` — consume new components (PRs 3–6)
- Every other page under `src/pages/` — header swap + tile/badge swaps (PR 7a–d)

**Will be created:**
- `src/components/layout/PageShell.tsx`
- `src/components/layout/PageHeader.tsx`
- `src/components/ui/SectionCard.tsx`
- `src/components/ui/SectionLabel.tsx`
- `src/components/ui/StickyFooterCTA.tsx`
- `src/components/ui/FilterBar.tsx` (+ FilterPill)
- `src/components/ui/SegmentedTabs.tsx`
- `src/components/ui/ProgressBar.tsx`
- `__tests__/` companion for each

**Will NOT change:**
- `<BottomNav>` styling stays except a minor token-driven shadow tweak via Layer 1
- Routing, services, hooks, transforms, business logic — styling-only refactor
- `<PriorityCard>` API — retint its tone palette to the new accent tokens, no consumer changes

---

## Locked-in decisions

- **Scope: full app restyle, including Referral & Bonus.** No half-styled app.
- **`<PriorityCard>` stays** — retint to new tokens; API unchanged.
- **PR cadence: 7 PRs (with 7a–d sub-PRs).** Each shippable independently; each gets its own commit + push + PR.

---

## Why this beats a page-by-page redesign

| | Page-by-page | This plan |
|---|---|---|
| Where #10b981 lives | Repeated ~50× across page files | One token, in one file |
| Adding a new page | Re-copy header JSX, hope you match | `<PageHeader>` + done |
| Spec says "raise card shadow" | Edit every page | Edit one token |
| Risk of drift in 3 months | High | Low |
| Tests required | 0 new (pages already have some) | ~8 small component tests (cheap, durable) |
| `!important` usage | Likely needed | Not needed |

---

## Verification (when implementation lands)

- `npm run typecheck` && `npm run test:run` && `npm run build` green
- Manual: navigate all pages via bottom nav — header height, sticky behavior, card shadow, badge colors, FAB shadow all match spec
- Manual: in DevTools, search rendered DOM for `#10b981` — should appear via CSS vars only, not as inline hex anywhere
- Playwright smoke spec passes (no behavior changed)
- `grep src/pages -r '<header'` returns ~zero after PR 7
