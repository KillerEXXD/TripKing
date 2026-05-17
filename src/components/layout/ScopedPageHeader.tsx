import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Carry the home-card colour into the destination page so the click-through feels
 *  like a continuation, not a jump to a fresh page. Mirrors `PriorityCard`'s tone
 *  palette — tap a `tone="indigo"` card → land on a page whose header is tinted
 *  the same way. Only the *header strip* is tinted; the cards below stay neutral
 *  so each row still reads cleanly. */
export type ScopedHeaderTone = 'emerald' | 'indigo' | 'amber' | 'teal' | 'blue' | 'slate';

interface ToneClasses {
  band: string;
  title: string;
  subtitle: string;
  iconWrap: string;
  iconColor: string;
}

const TONE: Record<ScopedHeaderTone, ToneClasses> = {
  emerald: {
    band: 'bg-emerald-50 border-emerald-100',
    title: 'text-emerald-900',
    subtitle: 'text-emerald-800',
    iconWrap: 'bg-emerald-100',
    iconColor: 'text-emerald-700',
  },
  indigo: {
    band: 'bg-purple-50 border-purple-100',
    title: 'text-indigo-900',
    subtitle: 'text-indigo-800',
    iconWrap: 'bg-purple-100',
    iconColor: 'text-purple-700',
  },
  amber: {
    band: 'bg-amber-50 border-amber-100',
    title: 'text-amber-900',
    subtitle: 'text-amber-800',
    iconWrap: 'bg-amber-100',
    iconColor: 'text-amber-700',
  },
  teal: {
    band: 'bg-teal-50 border-teal-100',
    title: 'text-teal-900',
    subtitle: 'text-teal-800',
    iconWrap: 'bg-teal-100',
    iconColor: 'text-teal-700',
  },
  blue: {
    band: 'bg-blue-50 border-blue-100',
    title: 'text-blue-900',
    subtitle: 'text-blue-800',
    iconWrap: 'bg-blue-100',
    iconColor: 'text-blue-700',
  },
  slate: {
    band: 'bg-slate-50 border-slate-100',
    title: 'text-slate-900',
    subtitle: 'text-slate-700',
    iconWrap: 'bg-slate-100',
    iconColor: 'text-slate-700',
  },
};

export interface ScopedPageHeaderProps {
  /** Page heading text. */
  title: ReactNode;
  /** Sub-line under the title (count, scope context, etc.). */
  subtitle?: ReactNode;
  /** Optional icon to the left of the title (matches the home-card's icon). */
  icon?: ReactNode;
  /** Static back-arrow target. Mutually exclusive with `onBack`. */
  backTo?: string;
  /** Custom back-arrow handler — use when the back target is computed at click time
   *  (e.g., depends on `location.state.from`). Mutually exclusive with `backTo`. */
  onBack?: () => void;
  /** Tone — picks the tinted band + heading colour. */
  tone: ScopedHeaderTone;
  /** Optional right-side slot (e.g., a small action button). */
  right?: ReactNode;
  className?: string;
}

/**
 * Header strip for scoped drill-down pages — back arrow + title + optional subtitle,
 * all tinted in the home-card's tone so the user sees visual continuity from the
 * card they tapped. Sticky at the top.
 */
export function ScopedPageHeader({
  title,
  subtitle,
  icon,
  backTo,
  onBack,
  tone,
  right,
  className,
}: ScopedPageHeaderProps) {
  const t = TONE[tone];
  const backClassName = cn('-ml-1 flex size-8 items-center justify-center rounded-full transition-colors hover:bg-white/60', t.iconColor);
  return (
    <header className={cn('sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-3 shadow-header', t.band, className)}>
      {backTo ? (
        <Link to={backTo} aria-label="Back" className={backClassName}>
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
      ) : (
        <button type="button" onClick={onBack} aria-label="Back" className={backClassName}>
          <ArrowLeft className="size-5" aria-hidden />
        </button>
      )}
      {icon ? (
        <span aria-hidden className={cn('inline-flex size-8 shrink-0 items-center justify-center rounded-full', t.iconWrap, t.iconColor)}>
          {icon}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className={cn('truncate text-base font-semibold leading-tight', t.title)}>{title}</h1>
        {subtitle ? <p className={cn('truncate text-xs', t.subtitle)}>{subtitle}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </header>
  );
}
