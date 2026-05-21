import type { TripCategory } from '@/types';
import { cn } from '@/lib/utils';

/**
 * Top-level segmented control on `PostTripPage` — picks the booking *category* (migration 071).
 *   - Local      : address-booked, point-to-point with optional stops.
 *   - Outstation : city-to-city; a one-way / round-trip sub-toggle appears below.
 *   - Package    : hourly rental (pickup + hours + included km).
 */
export interface TripCategoryTabsProps {
  value: TripCategory;
  onChange: (next: TripCategory) => void;
  className?: string;
}

interface TabSpec {
  value: TripCategory;
  label: string;
  hint: string;
}
const TABS: TabSpec[] = [
  { value: 'local',      label: 'Local',      hint: 'Around town, by address' },
  { value: 'outstation', label: 'Outstation', hint: 'City to city' },
  { value: 'package',    label: 'Package',    hint: 'Hourly rental' },
];

export function TripCategoryTabs({ value, onChange, className }: TripCategoryTabsProps) {
  return (
    <div role="tablist" aria-label="Trip category" className={cn('flex gap-1.5 rounded-2xl border bg-white p-1', className)}>
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
              active ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-transparent text-secondary hover:bg-muted',
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

export default TripCategoryTabs;
