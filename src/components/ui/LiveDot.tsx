import { cn } from '@/lib/utils';

/**
 * Small pulsing emerald dot — shown next to a status badge / page header while a
 * query is actively polling for changes. Conveys "this page is auto-updating —
 * you don't need to refresh." Pure presentation; the caller decides when to render
 * it (typically gated on `isTripLive(trip.status)` from `useTrips.ts`).
 *
 *   <LiveDot label="Live" />              // dot + tiny uppercase label
 *   <LiveDot ariaLabel="Auto-refreshing" /> // dot only, screen-readable
 *
 * Respects `prefers-reduced-motion` (pulse hidden, static dot remains).
 */
export interface LiveDotProps {
  /** Visible label next to the dot (10px uppercase). Default `'Live'`. Pass `""` for dot-only. */
  label?: string;
  /** Screen-reader label. Defaults to `label` or `'Live — auto-updating'`. */
  ariaLabel?: string;
  /** Tone — emerald default; amber for "waiting" surfaces (selected awaiting-acceptance). */
  tone?: 'emerald' | 'amber';
  className?: string;
}

const TONE = {
  emerald: { dot: 'bg-emerald-500', ring: 'bg-emerald-400/60', text: 'text-emerald-700' },
  amber:   { dot: 'bg-amber-500',   ring: 'bg-amber-400/60',   text: 'text-amber-700' },
} as const;

export function LiveDot({ label = 'Live', ariaLabel, tone = 'emerald', className }: LiveDotProps) {
  const t = TONE[tone];
  const hasLabel = label !== '';
  return (
    <span
      role="status"
      aria-label={ariaLabel ?? (label || 'Live — auto-updating')}
      className={cn('inline-flex shrink-0 items-center gap-1.5 align-middle', className)}
    >
      <span className="relative inline-flex size-2">
        <span
          className={cn(
            'absolute inset-0 rounded-full motion-safe:animate-ping',
            t.ring,
          )}
          aria-hidden
        />
        <span className={cn('relative inline-flex size-2 rounded-full', t.dot)} aria-hidden />
      </span>
      {hasLabel ? (
        <span className={cn('text-[10px] font-semibold uppercase tracking-wider', t.text)}>{label}</span>
      ) : null}
    </span>
  );
}

export default LiveDot;
