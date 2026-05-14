import type { TripType } from '@/types';
import { cn } from '@/lib/utils';

/**
 * Segmented control at the top of `PostTripPage` — picks the trip's *route shape*.
 * One-way is the default and renders today's single-leg form unchanged. Round-trip and
 * Multi-way unlock waypoint-aware fields below. Pure Tailwind on three `<button>`s
 * (a `<div role="tablist">` so the keyboard story stays straightforward).
 */
export interface TripTypeTabsProps {
  value: TripType;
  onChange: (next: TripType) => void;
  className?: string;
}

interface TabSpec {
  value: TripType;
  label: string;
  hint: string;
}
const TABS: TabSpec[] = [
  { value: 'one_way',    label: 'One-way',    hint: 'A → B drop' },
  { value: 'round_trip', label: 'Round-trip', hint: 'A → B → A (waits, returns)' },
  { value: 'multi_way',  label: 'Multi-way',  hint: 'A → B → C → … (drop or return)' },
];

export function TripTypeTabs({ value, onChange, className }: TripTypeTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Trip type"
      className={cn('flex gap-1.5 rounded-2xl border bg-white p-1', className)}
    >
      {TABS.map((t) => {
        const active = value === t.value;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              'flex-1 rounded-xl px-3 py-2 text-center transition-colors',
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-transparent text-secondary hover:bg-muted',
            )}
          >
            <div className="text-xs font-semibold">{t.label}</div>
            <div className={cn('mt-0.5 text-[10px]', active ? 'text-primary-foreground/80' : 'text-secondary')}>{t.hint}</div>
          </button>
        );
      })}
    </div>
  );
}

export default TripTypeTabs;
