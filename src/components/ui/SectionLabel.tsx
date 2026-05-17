import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type SectionLabelAccent = 'default' | 'green';

export interface SectionLabelProps {
  children: ReactNode;
  className?: string;
  /** Optional leading icon (rendered at size-4, inherits text color). */
  icon?: ReactNode;
  /**
   * `default` (today) — muted-foreground uppercase 10px tag.
   * `green` — emerald-700, slightly larger (Title-Case style heading); used as the
   * primary header for form sections that should pull the eye, paired with `icon`.
   */
  accent?: SectionLabelAccent;
}

const accentStyles: Record<SectionLabelAccent, string> = {
  default: 'text-section-label font-bold uppercase tracking-wider text-muted-foreground',
  // Reads as a section heading, not a tag — bigger, normal case, brand colour.
  green: 'text-sm font-semibold text-emerald-700',
};

/**
 * Section label / heading for grouping cards. Two variants:
 *
 * - `accent="default"` (the original behaviour) — uppercase 10px muted tag.
 * - `accent="green"` + an `icon` — the form-section pattern: icon + bold green heading,
 *   used on PostTripPage / PostVacancyPage / CreateAlertPage etc.
 *
 * Existing callers without props keep rendering identically (default accent, no icon).
 */
export function SectionLabel({ children, className, icon, accent = 'default' }: SectionLabelProps) {
  return (
    <div className={cn('flex items-center gap-1.5', accentStyles[accent], className)}>
      {icon ? <span className="inline-flex shrink-0 [&_svg]:size-4">{icon}</span> : null}
      <span>{children}</span>
    </div>
  );
}
