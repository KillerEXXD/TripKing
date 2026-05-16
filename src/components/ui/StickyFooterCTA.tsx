import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface StickyFooterCTAProps {
  children: ReactNode;
  className?: string;
}

/**
 * Fixed footer band for forms / wizards with a primary action at the
 * bottom — Post-a-trip "Continue", confirmation modals, the apply CTA
 * on TripDetail. White surface, shadow-footer token rising up over the
 * page-grey, safe-area inset for notched phones, layered above the
 * bottom nav (z-30).
 *
 * Stays within the centered mobile column (max-w-md) so the band
 * doesn't visually float on tablets / desktop preview.
 */
export function StickyFooterCTA({ children, className }: StickyFooterCTAProps) {
  return (
    <div
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 border-t border-border/40 bg-surface pb-[env(safe-area-inset-bottom,0px)] shadow-footer',
        className,
      )}
    >
      <div className="mx-auto flex max-w-md flex-col gap-2 px-4 py-3">
        {children}
      </div>
    </div>
  );
}
