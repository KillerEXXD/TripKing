import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SegmentedTabsOption<V extends string> {
  value: V;
  label: ReactNode;
  /** Optional count bubble — same look as <FilterPill>'s count. */
  count?: number;
}

export interface SegmentedTabsProps<V extends string> {
  value: V;
  onChange: (value: V) => void;
  options: SegmentedTabsOption<V>[];
  className?: string;
  ariaLabel?: string;
}

/**
 * Equal-width segmented control — used by PostedTripsPage for the
 * Open / Has applicants / In progress / Completed strip, and by any
 * future tab strip. Renders a single rounded pill containing N
 * buttons; the active button lifts to a white inner surface.
 *
 * Generic over the value type so callers get exhaustive type safety
 * on `onChange`.
 */
export function SegmentedTabs<V extends string>({ value, onChange, options, className, ariaLabel = 'Tabs' }: SegmentedTabsProps<V>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('inline-flex w-full gap-1 rounded-pill bg-surface-muted p-1', className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-semibold transition-colors',
              active ? 'bg-surface text-foreground shadow-card' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span>{o.label}</span>
            {typeof o.count === 'number' ? (
              <span className={cn('inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold', active ? 'bg-muted text-foreground' : 'bg-muted text-muted-foreground')}>
                {o.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
