import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Tone palette — one per semantic category. See docs/CARD_DESIGN_SYSTEM_RFC.md.
 *  emerald → "go" / live (Driving now, I'm vacant, Post a trip)
 *  indigo  → decision (Invitation waiting, driver-side Review)
 *  amber   → attention / status (Reputation, Ready to start, agent-side Waiting)
 *  teal    → money / outcomes (Earnings)
 *  blue    → data (Analytics)
 *  slate   → legacy empty-state only — do not use for new code
 */
export type PriorityCardTone = 'emerald' | 'indigo' | 'amber' | 'teal' | 'blue' | 'slate';

interface ToneClasses {
  outer: string;
  label: string;
  title: string;
  subtitle: string;
  pill: string;
}

const TONE: Record<PriorityCardTone, ToneClasses> = {
  emerald: {
    outer: 'border-emerald-300 bg-emerald-50 hover:bg-emerald-100',
    label: 'text-emerald-700',
    title: 'text-emerald-950',
    subtitle: 'text-emerald-800',
    pill: 'bg-emerald-700',
  },
  indigo: {
    outer: 'border-indigo-300 bg-indigo-50 hover:bg-indigo-100',
    label: 'text-indigo-700',
    title: 'text-indigo-950',
    subtitle: 'text-indigo-800',
    pill: 'bg-indigo-700',
  },
  amber: {
    outer: 'border-amber-300 bg-amber-50 hover:bg-amber-100',
    label: 'text-amber-700',
    title: 'text-amber-950',
    subtitle: 'text-amber-800',
    pill: 'bg-amber-700',
  },
  teal: {
    outer: 'border-teal-300 bg-teal-50 hover:bg-teal-100',
    label: 'text-teal-700',
    title: 'text-teal-950',
    subtitle: 'text-teal-800',
    pill: 'bg-teal-700',
  },
  blue: {
    outer: 'border-blue-300 bg-blue-50 hover:bg-blue-100',
    label: 'text-blue-700',
    title: 'text-blue-950',
    subtitle: 'text-blue-800',
    pill: 'bg-blue-700',
  },
  slate: {
    outer: 'border-slate-200 bg-slate-50',
    label: 'text-slate-500',
    title: 'text-slate-700',
    subtitle: 'text-slate-500',
    pill: 'bg-slate-700',
  },
};

interface CtaProp {
  label: string;
  icon?: ReactNode;
}

interface BaseProps {
  tone: PriorityCardTone;
  /** Uppercase header line (e.g. "Driving now", "Your earnings"). */
  label: ReactNode;
  /** Lucide icon rendered to the left of the label. Pass `<Icon className="size-3.5" aria-hidden />`. */
  icon: ReactNode;
  /** Big bold line — usually the primary value (route, count, headline). */
  title: ReactNode;
  /** Optional secondary line in the tone's subtitle colour. */
  subtitle?: ReactNode;
  /** Optional pill CTA rendered at the bottom. */
  cta?: CtaProp;
  /** Optional rich body (stat grids, etc.) rendered between subtitle and cta. */
  children?: ReactNode;
  className?: string;
  /** Accessibility label override — useful when the visible text isn't descriptive enough on its own. */
  ariaLabel?: string;
}

type Props =
  | (BaseProps & { to: string; linkState?: unknown; onClick?: never })
  | (BaseProps & { onClick: () => void; to?: never; linkState?: never })
  | (BaseProps & { to?: undefined; onClick?: undefined; linkState?: never });

/**
 * The canonical "priority card" — a chunky, tinted, action-oriented card used
 * on the driver/agent home stacks. See docs/CARD_DESIGN_SYSTEM_RFC.md for the
 * design spec.
 *
 * Picks its element shape from the props:
 *  - `to`       → renders a `<Link>` (most common)
 *  - `onClick`  → renders a `<div role="button">` with keyboard handlers
 *  - neither    → renders a static `<div>` (display-only)
 */
export function PriorityCard(props: Props) {
  const { tone, label, icon, title, subtitle, cta, children, className, ariaLabel } = props;
  const t = TONE[tone];
  const isInteractive = 'to' in props && props.to ? true : 'onClick' in props && props.onClick ? true : false;
  const containerClass = cn(
    'block rounded-2xl border-2 p-4 transition-colors',
    t.outer,
    isInteractive ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1' : null,
    className,
  );

  const body = (
    <>
      <div className={cn('flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide', t.label)}>
        {icon} {label}
      </div>
      <div className={cn('mt-1 text-lg font-bold', t.title)}>{title}</div>
      {subtitle ? <div className={cn('mt-0.5 text-xs', t.subtitle)}>{subtitle}</div> : null}
      {children}
      {cta ? (
        <div className={cn('mt-3 inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-sm font-semibold text-white', t.pill)}>
          {cta.label} {cta.icon ?? <ChevronRight className="size-4" aria-hidden />}
        </div>
      ) : null}
    </>
  );

  if ('to' in props && props.to) {
    return (
      <Link to={props.to} state={props.linkState} aria-label={ariaLabel} className={containerClass}>
        {body}
      </Link>
    );
  }

  if ('onClick' in props && props.onClick) {
    const onClick = props.onClick;
    const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onClick();
      }
    };
    const onClickHandler = (e: MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      onClick();
    };
    return (
      <div role="button" tabIndex={0} aria-label={ariaLabel} onClick={onClickHandler} onKeyDown={onKeyDown} className={containerClass}>
        {body}
      </div>
    );
  }

  return (
    <div aria-label={ariaLabel} className={containerClass}>
      {body}
    </div>
  );
}

export default PriorityCard;
