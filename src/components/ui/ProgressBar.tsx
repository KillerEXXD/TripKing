import { cn } from '@/lib/utils';

export interface ProgressBarProps {
  value: number;
  max?: number;
  /** Optional aria-label — falls back to "Step X of Y". */
  ariaLabel?: string;
  className?: string;
}

/**
 * Linear progress bar — used by Post-a-trip's "Step 1 of 2" / "Step 2 of 2"
 * top indicator and any other multi-step flow. Clamps `value` to
 * `[0, max]` so callers never need to. Renders as an accessible
 * `<progress>`-style div pair (no native <progress> because it doesn't
 * pick up our tokens cleanly across browsers).
 */
export function ProgressBar({ value, max = 100, ariaLabel, className }: ProgressBarProps) {
  const safeMax = Math.max(1, max);
  const clamped = Math.min(Math.max(0, value), safeMax);
  const pct = (clamped / safeMax) * 100;
  return (
    <div
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-label={ariaLabel ?? `Step ${clamped} of ${safeMax}`}
      className={cn('h-1.5 w-full overflow-hidden rounded-pill bg-muted', className)}
    >
      <div
        className="h-full bg-primary transition-[width] duration-200"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
