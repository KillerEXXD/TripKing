# Card Design System

> This is the **canonical reference** for cards in TripKing. The original RFC at `docs/CARD_DESIGN_SYSTEM_RFC.md` has been retired (PR 7).

There are exactly **two** card patterns in the app. Pick the one that matches the card's *job*.

## 1. `<PriorityCard>` — actionable, attention-getting

Source: [src/components/ui/priorityCard.tsx](../src/components/ui/priorityCard.tsx). Used for top-of-screen calls-to-action: live work cards, decisions awaiting the user, key navigation tiles.

### API

```tsx
type PriorityCardTone = 'emerald' | 'indigo' | 'amber' | 'teal' | 'blue' | 'slate';

interface PriorityCardProps {
  tone: PriorityCardTone;
  label: ReactNode;        // Uppercase header line
  icon: ReactNode;         // Lucide icon — pass <Icon className="size-3.5" aria-hidden />
  rightAction?: ReactNode; // Optional — countdown, button stack, etc. sits on the right of header
  title: ReactNode;        // Bold primary line
  subtitle?: ReactNode;    // Secondary line in tone subtitle colour
  cta?: { label: string; icon?: ReactNode };  // Pill CTA at bottom
  footerSlot?: ReactNode;  // Replaces the pill CTA — use for button rows / destructive buttons
  children?: ReactNode;    // Rich body (stat grids, etc.) — rendered between subtitle and footer
  className?: string;
  ariaLabel?: string;
}

// Element shape is inferred from props:
type Variants =
  | { to: string; linkState?: unknown }   // → <Link>  (most common)
  | { onClick: () => void }                // → <div role="button"> (keyboard-operable)
  | {};                                    // → static <div>
```

### Tone palette

One tone per semantic category. **Do not invent new tones** — if a new card doesn't fit, it probably belongs in the `<Card>` variant instead.

| Tone | Used for |
|---|---|
| `emerald` | Driving now (live), I'm vacant, Post a trip — the green "go" lane |
| `indigo` | Invitation waiting, driver-side Review — decision lane |
| `amber` | Reputation, Ready to start, agent-side Waiting for your decision — attention lane |
| `teal` | Earnings — money / outcomes |
| `blue` | Analytics, Invitations sent — data / measurement |
| `slate` | **Legacy** empty-state only — not used for any new code. Will be removed once it has no consumers. |

### Example

```tsx
<PriorityCard
  to="/my-earnings"
  tone="teal"
  icon={<TrendingUp className="size-3.5" aria-hidden />}
  label="Your earnings"
  title="Trips, payouts & monthly trend"
  subtitle="See what you've earned and where you're trending."
  cta={{ label: 'View earnings' }}
/>
```

With slots:

```tsx
<PriorityCard
  tone="emerald"
  icon={<CheckCircle2 className="size-3.5" aria-hidden />}
  label="You've been selected"
  rightAction={<CountdownTimer deadline={t.deadline} prefix="Accept within" />}
  title="Accept this trip to start."
  subtitle="If you don't respond before the timer hits zero, it goes back to other applicants."
  footerSlot={
    <div className="flex gap-2">
      <Button variant="full" className="flex-1" onClick={onAccept}>Accept</Button>
      <Button variant="outline" className="text-destructive" onClick={onDecline}>Decline</Button>
    </div>
  }
/>
```

## 2. `<Card>` — informational, list rows, dense data

Source: [src/components/ui/card.tsx](../src/components/ui/card.tsx). Used for list rows, detail panels, anywhere the user is *reading* the card rather than acting on it as a unit.

Pattern: `rounded-xl border bg-white p-4` (thin border, white background). Stays as-is — no changes from this migration.

## Documented exceptions

Two cards intentionally stay outside `<PriorityCard>` because their internal layout doesn't fit the API. Both have inline comments explaining why.

| Card | Why bespoke |
|---|---|
| **Passenger OTP** (TripDetailPage) | The 3xl mono OTP block is the centerpiece of the card and doesn't fit PriorityCard's `title` slot. Visual chrome (border-2, emerald tones) already aligned. |
| **IAmAvailableCard** | Large left-side icon chip (size-10) and an inline count/chevron toggle row inside the subtitle don't fit even with `rightAction` / `footerSlot`. Visual chrome aligned. |

If you find yourself adding a third exception, **revisit the API instead** — a third bespoke shape probably means we're missing a slot.

## What NOT to do

- Don't inline `rounded-2xl border-2 bg-{tone}-50 p-4` blocks. If it looks like a priority card, use `<PriorityCard>`.
- Don't invent new tones. The 6-tone palette is closed; new semantics either fit an existing tone or trigger a design conversation.
- Don't promote `<Card>` rows to `<PriorityCard>` just for emphasis. List rows are not priority cards. If the user needs to *act* on it, surface that action elsewhere (a CTA at the top of the list, an `<ActionCard>` above the list).
- Don't use `tone="slate"` for new code. It exists to keep the legacy empty-state copy around until the last consumer is removed.

## Migration history (closed)

| PR | Scope |
|---|---|
| [#136](https://github.com/KillerEXXD/TripKing/pull/136) | Build `<PriorityCard>`; migrate Driver + Agent home stacks |
| [#137](https://github.com/KillerEXXD/TripKing/pull/137) | `InvitesReceivedCard` / `InvitesSentCard` migrated; `IAmAvailableCard` chrome aligned |
| [#138](https://github.com/KillerEXXD/TripKing/pull/138) | Delete one-off `ActionCard` helper; visual-align TripDetailPage banners |
| [#139](https://github.com/KillerEXXD/TripKing/pull/139) | Add `rightAction` + `footerSlot` slots; migrate `SelectionBanner`, `AwaitingAcceptanceBanner`, `CurrentTripCard` |
| **This PR** | Promote RFC → final doc; close the migration |

After migration: 5 of 7 priority-style cards on the app route through `<PriorityCard>`. The 2 exceptions are explicitly justified above.

## Verifying consistency

```bash
# Should only return PriorityCard.tsx itself + the two documented exceptions:
grep -rln "rounded-2xl border-2" src/

# Expected:
#   src/components/ui/priorityCard.tsx
#   src/components/vacancy/IAmAvailableCard.tsx   ← documented exception
#   src/pages/TripDetailPage.tsx                  ← Passenger OTP, documented exception
#   src/pages/OnboardingPage.tsx                  ← role-picker radio buttons (different semantic, not a priority card)
```

A new match outside that list = a regression. Use `<PriorityCard>` or justify a new exception.
