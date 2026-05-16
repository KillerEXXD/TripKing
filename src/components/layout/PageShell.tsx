import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface PageShellProps {
  children: ReactNode;
  className?: string;
}

/**
 * Per-page content wrapper that sits INSIDE <AppLayout>. Pages compose:
 *
 *   <PageShell>
 *     <PageHeader title=... />
 *     ...page content...
 *   </PageShell>
 *
 * Centralises the mobile-first max-width (max-w-md) + horizontal padding +
 * the bottom padding that clears the fixed <BottomNav>. After PR 7 every
 * page should wrap in this — no inline `mx-auto max-w-md px-4 pb-20`
 * sprinkles, no per-page <main> classes.
 *
 * (The grey page background lives on <AppLayout>, not here, because the
 * background must extend edge-to-edge under the bottom nav.)
 */
export function PageShell({ children, className }: PageShellProps) {
  return (
    <div className={cn('mx-auto w-full max-w-md px-4 pb-24 pt-3', className)}>
      {children}
    </div>
  );
}
