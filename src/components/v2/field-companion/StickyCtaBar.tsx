import type { ReactNode } from 'react';

/**
 * Fixed bottom CTA bar — one big primary action. Designed for one-thumb
 * operation; padding accounts for the iOS home indicator.
 */
export function StickyCtaBar({ children }: { children: ReactNode }) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-page px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3"
      role="region"
      aria-label="Primary action"
    >
      {children}
    </div>
  );
}

export default StickyCtaBar;
