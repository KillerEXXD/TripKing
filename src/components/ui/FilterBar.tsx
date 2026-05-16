import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface FilterPillProps {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  /** Optional count badge — e.g. `12` next to "Open" — rendered as a small bubble. */
  count?: number;
  className?: string;
}

/**
 * One pill in a horizontal scrollable filter row. Active state uses the
 * primary token; inactive sits on the page-grey background.
 */
export function FilterPill({ active, onClick, children, count, className }: FilterPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors',
        active
          ? 'border-transparent bg-primary text-primary-foreground'
          : 'border-border bg-surface text-foreground hover:bg-muted',
        className,
      )}
    >
      <span>{children}</span>
      {typeof count === 'number' ? (
        <span
          className={cn(
            'inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold',
            active ? 'bg-white/25 text-white' : 'bg-muted text-muted-foreground',
          )}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

export interface FilterBarProps {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}

/**
 * Horizontal scrollable strip of `<FilterPill>`s. Used by VacanciesPage,
 * future filtered lists. Hides the scrollbar on touch surfaces.
 */
export function FilterBar({ children, className, ariaLabel = 'Filter' }: FilterBarProps) {
  return (
    <div
      role="toolbar"
      aria-label={ariaLabel}
      className={cn('-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', className)}
    >
      {children}
    </div>
  );
}
