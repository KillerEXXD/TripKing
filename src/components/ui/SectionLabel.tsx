import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface SectionLabelProps {
  children: ReactNode;
  className?: string;
}

/**
 * Uppercase 10px section label — the recurring "REPUTATION" / "PAYOUT
 * BREAKDOWN" / "DRIVER INSTRUCTIONS" pattern. Drops the inline
 * `text-[10px] uppercase tracking-wider text-secondary` ~30+ pages
 * had to reimplement.
 */
export function SectionLabel({ children, className }: SectionLabelProps) {
  return (
    <div className={cn('text-section-label font-bold uppercase tracking-wider text-muted-foreground', className)}>
      {children}
    </div>
  );
}
