# Card Design System — RFC

> Status: **proposed** — not yet implemented. Scope is a multi-PR effort; this RFC defines the variants and the migration order so it can be done incrementally without breaking pages mid-flight.

## Why

Driver Home and Agent Home now use a consistent **"priority card"** look-and-feel (rounded-2xl, border-2, tinted background, p-4, uppercase color label, bold title, pill CTA). The rest of the app does not:

- Most surfaces use the generic `<Card>` primitive from `src/components/ui/card.tsx` (`rounded-xl border`, white, thin) — fine for dense lists but feels weak next to the home stack.
- Many pages render inline `rounded-xl border bg-{tint}` blocks with bespoke padding/typography — visually similar but each slightly different.
- Some pages use yet a third pattern: `<Link>` wrappers with their own border + tint (e.g. the old Reputation/Earnings before PR #134).

Net effect: cards look one way on Home, another way on `/trips/:id`, a third on admin pages. The home pass made the inconsistency obvious by raising the bar on two screens; we need to either lift the rest or it'll keep getting flagged in QA.

## The two variants (final)

There are exactly **two** card looks in the app. Pick the variant that matches the card's *job*.

### 1. `PriorityCard` — actionable, attention-getting

The look we shipped on Home. Used for:
- Always-visible CTAs ("I'm vacant", "Post a trip")
- Live work (Driving now, Waiting for decision, Invitation waiting)
- Top-level navigation cards (Reputation, Earnings, Analytics)

**Style:** `rounded-2xl border-2 border-{tone}-300 bg-{tone}-50 p-4 transition-colors hover:bg-{tone}-100`

**Inner structure (the contract):**
1. Header line: small uppercase label with icon — `flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-{tone}-700`
2. Title: `mt-1 text-lg font-bold text-{tone}-950`
3. Subtitle (optional): `mt-0.5 text-xs text-{tone}-800`
4. Body (optional): grid / inline stats — uses `text-{tone}-900` family
5. CTA pill (optional): `mt-3 inline-flex items-center gap-1 rounded-full bg-{tone}-700 px-4 py-1.5 text-sm font-semibold text-white`

**Tone palette (one per semantic category):**

| Tone | Used for |
|---|---|
| `emerald` | Driving now (live), I'm vacant, Post a trip — the green "go" lane |
| `indigo` | Invitation waiting, Review (driver-side) — blue decision lane |
| `amber` | Reputation, Ready to start, Waiting for your decision (agent-side) — yellow attention lane |
| `teal` | Earnings — money / outcomes |
| `blue` | Analytics — data / measurement |

Don't invent new tones for new cards. If a new card doesn't fit one of these five, the card probably belongs in the standard variant instead.

### 2. `<Card>` (existing) — informational, list items, dense data

The existing `src/components/ui/card.tsx` primitive. Used for:
- Rows in a list (trip feed, applicants, posted trips, vacancies, notifications)
- Detail panels on `/trips/:id`, profile pages
- Admin tables
- Anywhere the user is *reading* the card, not acting on it as a unit

No change needed here — the variant already works. Stop using it for top-level CTAs (use `PriorityCard` there instead).

## What we build

A single new component `src/components/ui/PriorityCard.tsx`:

```tsx
type Tone = 'emerald' | 'indigo' | 'amber' | 'teal' | 'blue' | 'slate';
interface Props {
  to?: string;              // Link wrap (most cards) OR
  onClick?: () => void;     // Button wrap (some action cards)
  tone: Tone;
  label: string;            // Uppercase header
  icon: ReactNode;          // Lucide icon
  title: ReactNode;         // Big bold line
  subtitle?: ReactNode;     // Optional grey-of-tone line
  cta?: { label: string; icon?: ReactNode }; // Pill button
  children?: ReactNode;     // For richer bodies (Driving-now stats grid, Reputation grid)
}
```

- Renders a `<Link>` (when `to`) or `<div role="button">` (when `onClick`) or a static `<div>` (neither).
- Tone is a single prop — internal Tailwind class map keeps the colour family consistent.
- `slate` tone is reserved for **legacy** empty states only and will be removed once all empty states are hidden.

## Migration plan (PR-sized chunks)

| # | PR | Files | Risk |
|---|---|---|---|
| 1 | Build `PriorityCard` + Storybook-style harness in `__tests__` | new file + test | none |
| 2 | Migrate Driver Home — replace 5 inline blocks with `<PriorityCard>` | `DriverHomePage.tsx` + test | low (snapshot covered) |
| 3 | Migrate Agent Home — replace 5 inline blocks with `<PriorityCard>` | `AgentHomePage.tsx` + test | low |
| 4 | Migrate `InvitesReceivedCard`, `InvitesSentCard`, `IAmAvailableCard` | 3 components | low |
| 5 | Migrate `/posted-trips` priority strip + `/my-trips` Driving/Selected cards if any survive | 2 pages | medium |
| 6 | Sweep remaining inline `rounded-2xl border-2` blocks (grep for the literal class string) | N pages | low |
| 7 | Document in `docs/CARD_DESIGN_SYSTEM.md` (promote from RFC) + retire this file | docs | none |

PRs 1–3 should land together as one batch (they cleanly demonstrate the win and don't leave anything half-migrated). PRs 4–6 can ship over the following week.

## Out of scope (explicitly)

- **Don't touch the `<Card>` primitive** — works fine for list rows and detail panels.
- **Don't redesign individual page layouts** — this is purely about card chrome consistency, not information architecture.
- **Don't migrate admin pages this round** — they have their own density patterns (tables, multi-column forms). Revisit after the driver/agent surfaces are clean.
- **No new tones.** If a future card doesn't fit the palette, that's a design conversation, not a code one.

## Acceptance

- A driver flipping between Home, `/my-trips`, `/trips/:id`, `/vacancies` sees the same card chrome on every "do this next" CTA, the same hover, the same pill button.
- An agent on Home and `/posted-trips` sees the same.
- `grep -rn "rounded-2xl border-2" src/` returns only `PriorityCard.tsx` after PR 6.
- Test coverage stays ≥ 85% throughout (PriorityCard ships with its own tests; migrations don't lose any).
