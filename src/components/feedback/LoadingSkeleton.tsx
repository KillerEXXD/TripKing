import { cn } from '@/lib/utils';

export interface LoadingSkeletonProps {
  /** Number of skeleton rows to render. */
  rows?: number;
  className?: string;
}

/**
 * Inline loading placeholder. Use this (not a spinner) while a data view is
 * pending — one per section, so a partial refresh only blanks that section.
 */
export function LoadingSkeleton({ rows = 3, className }: LoadingSkeletonProps) {
  return (
    <div className={cn('space-y-3', className)} role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-16 w-full animate-pulse rounded-xl bg-black/5" />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export default LoadingSkeleton;
