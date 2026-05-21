import { Check } from 'lucide-react';
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
    <div role="tablist" aria-label="Trip direction" className={cn('flex gap-2 rounded-xl', className)}>
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
              'relative flex-1 rounded-xl border-2 px-3 py-2 text-center transition-colors',
              active
                ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30'
                : 'border-input bg-white text-secondary hover:border-primary/40',
            )}
          >
            {active ? (
              <span className="absolute right-1.5 top-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3" aria-hidden />
              </span>
            ) : null}
            <div className={cn('text-sm font-bold', active ? 'text-primary' : 'text-foreground')}>{t.label}</div>
            <div className={cn('mt-0.5 text-[10px]', active ? 'text-primary/70' : 'text-secondary')}>{t.hint}</div>
          </button>
        );
      })}
    </div>
  );
}

export default TripDirectionToggle;
