import { cn } from '@/lib/utils';

/** Outstation sub-toggle — the route's direction. (Local is always one-way; Package has no direction.) */
export type TripDirection = 'one_way' | 'round_trip';

export interface TripDirectionToggleProps {
  value: TripDirection;
  onChange: (next: TripDirection) => void;
  className?: string;
}

const TABS: { value: TripDirection; label: string; hint: string }[] = [
  { value: 'one_way',    label: 'One-way',    hint: 'A → B (stops allowed)' },
  { value: 'round_trip', label: 'Round-trip', hint: 'A → … → back to A' },
];

export function TripDirectionToggle({ value, onChange, className }: TripDirectionToggleProps) {
  return (
    <div role="tablist" aria-label="Trip direction" className={cn('flex gap-1.5 rounded-xl border bg-muted/40 p-1', className)}>
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
              'flex-1 rounded-lg px-3 py-1.5 text-center transition-colors',
              active ? 'bg-white text-foreground shadow-sm' : 'bg-transparent text-secondary hover:bg-white/50',
            )}
          >
            <div className="text-xs font-semibold">{t.label}</div>
            <div className="mt-0.5 text-[10px] text-secondary">{t.hint}</div>
          </button>
        );
      })}
    </div>
  );
}

export default TripDirectionToggle;
