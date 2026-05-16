import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Semantic tone keys mapped onto the redesign accent / status colour
 * vocabulary. Each pair drives the banner's border, background, and the
 * default text colour:
 *   success  — green (e.g. "Applied", "All caught up", verified)
 *   info     — blue  (e.g. "Awaiting decision", neutral note)
 *   warning  — amber (e.g. "Verify your account", "Almost done")
 *   danger   — red   (e.g. "Application withdrawn", failures)
 */
export type StatusBannerTone = 'success' | 'info' | 'warning' | 'danger';

interface ToneClasses {
  outer: string;
  text: string;
}

const TONE: Record<StatusBannerTone, ToneClasses> = {
  success: { outer: 'border-emerald-200 bg-emerald-50', text: 'text-emerald-900' },
  info:    { outer: 'border-blue-200 bg-blue-50',       text: 'text-blue-900' },
  warning: { outer: 'border-amber-200 bg-amber-50',     text: 'text-amber-900' },
  danger:  { outer: 'border-red-200 bg-red-50',         text: 'text-red-900' },
};

export interface StatusBannerProps {
  tone: StatusBannerTone;
  /** Optional Lucide icon rendered on the left. */
  icon?: ReactNode;
  /** Main heading line (bold). */
  title?: ReactNode;
  /** Body line(s) under the title; muted within the tone. */
  children?: ReactNode;
  className?: string;
}

/**
 * Tinted status banner — the recurring "You've applied" / "Verify your
 * account" / "Trip cancelled" / "Application withdrawn" surface that used
 * to live as inline `border-emerald-200 bg-emerald-50 px-4 py-3` divs
 * scattered across ~24 spots in the codebase. Replaces them with one
 * tone-keyed component so a future re-theme retints all of them at once.
 *
 * Not a `<Card>` — banners are flatter and sit IN cards or above content,
 * so they use a 1px border + tinted bg rather than the card shadow.
 */
export function StatusBanner({ tone, icon, title, children, className }: StatusBannerProps) {
  const t = TONE[tone];
  return (
    <div
      role="status"
      className={cn('flex items-start gap-2 rounded-card border px-3 py-2.5 text-sm', t.outer, t.text, className)}
    >
      {icon ? <span className="mt-0.5 shrink-0 [&_svg]:size-4" aria-hidden>{icon}</span> : null}
      <div className="min-w-0 flex-1 space-y-0.5">
        {title ? <div className="font-semibold leading-tight">{title}</div> : null}
        {children ? <div className="text-xs leading-snug opacity-90">{children}</div> : null}
      </div>
    </div>
  );
}
