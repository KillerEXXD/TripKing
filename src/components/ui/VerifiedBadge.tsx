import { BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export type VerifiedBadgeTone = 'emerald' | 'sky' | 'amber' | 'violet';
export type VerifiedBadgeSize = 'xs' | 'sm';

interface VerifiedBadgeProps {
  /** Defaults to "Verified". Set "" with `iconOnly` for a compact dot-only badge. */
  label?: string;
  size?: VerifiedBadgeSize;
  tone?: VerifiedBadgeTone;
  /** Drop the label and render the check chip only — good for very tight rows. */
  iconOnly?: boolean;
  className?: string;
  /** Visible to screen readers. Defaults to "Verified by TripKing KYC". */
  ariaLabel?: string;
}

const TONE: Record<VerifiedBadgeTone, { ring: string; bg: string; fg: string; dot: string }> = {
  emerald: { ring: 'ring-emerald-200/70', bg: 'bg-gradient-to-b from-emerald-50 to-emerald-100/70', fg: 'text-emerald-700', dot: 'bg-emerald-500' },
  sky:     { ring: 'ring-sky-200/70',     bg: 'bg-gradient-to-b from-sky-50 to-sky-100/70',         fg: 'text-sky-700',     dot: 'bg-sky-500' },
  amber:   { ring: 'ring-amber-200/70',   bg: 'bg-gradient-to-b from-amber-50 to-amber-100/70',     fg: 'text-amber-800',   dot: 'bg-amber-500' },
  violet:  { ring: 'ring-violet-200/70',  bg: 'bg-gradient-to-b from-violet-50 to-violet-100/70',   fg: 'text-violet-700',  dot: 'bg-violet-500' },
};

/**
 * Compact "Verified" pill for KYC-approved drivers / agents. Inline-flex, ≤ 22 px tall,
 * sits next to a name on cards. Two sizes; four tones (we default to emerald for the
 * marketplace surfaces). Use `iconOnly` for very tight rows.
 *
 *   <VerifiedBadge />                              // emerald, "Verified"
 *   <VerifiedBadge size="xs" />                    // tinier
 *   <VerifiedBadge iconOnly />                     // just the check chip
 *   <VerifiedBadge tone="sky" label="ID verified" />
 */
export function VerifiedBadge({
  label = 'Verified',
  size = 'sm',
  tone = 'emerald',
  iconOnly = false,
  className,
  ariaLabel,
}: VerifiedBadgeProps) {
  const t = TONE[tone];
  const padding = size === 'xs' ? 'h-[18px] gap-1 pl-1 pr-1.5' : 'h-[22px] gap-1.5 pl-1 pr-2';
  const text = size === 'xs' ? 'text-[9px]' : 'text-[10px]';
  const iconBox = size === 'xs' ? 'size-3.5' : 'size-4';
  const iconStroke = size === 'xs' ? 'size-2.5' : 'size-3';

  return (
    <span
      role="img"
      aria-label={ariaLabel ?? 'Verified by TripKing KYC'}
      className={cn(
        'inline-flex shrink-0 items-center rounded-full ring-1 align-middle font-semibold uppercase tracking-wider',
        padding,
        t.bg,
        t.fg,
        t.ring,
        'shadow-[0_1px_0_rgba(255,255,255,0.6)_inset]',
        className,
      )}
    >
      <span className={cn('flex items-center justify-center rounded-full text-white', iconBox, t.dot)}>
        <BadgeCheck className={cn(iconStroke)} strokeWidth={3} aria-hidden />
      </span>
      {iconOnly ? null : <span className={text}>{label}</span>}
    </span>
  );
}

export default VerifiedBadge;
