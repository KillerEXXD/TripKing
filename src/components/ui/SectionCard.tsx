import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/**
 * Accent palette — keys map 1:1 to the --color-*-accent token pairs in
 * src/index.css. Adding a new accent? Add the token, then add it here.
 */
export type SectionCardAccent = 'green' | 'amber' | 'blue' | 'purple' | 'grey';

interface ToneClasses {
  border: string;
  label: string;
  bg: string;
}

const TONE: Record<SectionCardAccent, ToneClasses> = {
  green:  { border: 'border-l-green-accent',  label: 'text-green-accent',  bg: 'bg-green-accent-light'  },
  amber:  { border: 'border-l-amber-accent',  label: 'text-amber-accent',  bg: 'bg-amber-accent-light'  },
  blue:   { border: 'border-l-blue-accent',   label: 'text-blue-accent',   bg: 'bg-blue-accent-light'   },
  purple: { border: 'border-l-purple-accent', label: 'text-purple-accent', bg: 'bg-purple-accent-light' },
  grey:   { border: 'border-l-grey-accent',   label: 'text-grey-accent',   bg: 'bg-grey-accent-light'   },
};

interface BaseProps {
  accent: SectionCardAccent;
  /** Uppercase header line — e.g. "VACANT DRIVERS", "REPUTATION". */
  label?: ReactNode;
  /** Lucide icon rendered to the left of the label. */
  icon?: ReactNode;
  /** Main body — usually a stat / value / inline rows. */
  children: ReactNode;
  /** Optional content rendered on the right of the header (count, action). */
  rightAction?: ReactNode;
  className?: string;
}

type Props =
  | (BaseProps & { to: string; onClick?: never })
  | (BaseProps & { onClick: () => void; to?: never })
  | (BaseProps & { to?: undefined; onClick?: undefined });

/**
 * Tinted-tile section card — the redesign's recurring dashboard pattern.
 * Each accent uses two tokens: the stronger one drives the 4px left
 * border + the label/icon colour; the lighter one fills the tile bg.
 *
 * The tile sits on the page-grey background, so the lighter tint reads
 * as a subtle wash rather than a hard block. Five accents cover every
 * semantic category we use today; if you need a sixth, add the token
 * pair first and the entry above — never inline a hex.
 *
 * Renders as a `<Link>`, a clickable `<div role="button">`, or a static
 * `<div>` depending on which optional `to` / `onClick` prop is set.
 */
export function SectionCard(props: Props) {
  const { accent, label, icon, children, rightAction, className } = props;
  const tone = TONE[accent];
  const interactive = ('to' in props && props.to) || ('onClick' in props && props.onClick);

  const container = cn(
    'block rounded-card border-l-4 p-4 transition-colors',
    tone.border,
    tone.bg,
    interactive && 'cursor-pointer hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1',
    className,
  );

  const body = (
    <>
      {(label || icon || rightAction) ? (
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className={cn('flex items-center gap-1.5 text-section-label font-bold uppercase tracking-wider', tone.label)}>
            {icon}
            {label}
          </div>
          {rightAction ? <div className="shrink-0">{rightAction}</div> : null}
        </div>
      ) : null}
      <div className="text-foreground">{children}</div>
    </>
  );

  if ('to' in props && props.to) {
    return <Link to={props.to} className={container}>{body}</Link>;
  }
  if ('onClick' in props && props.onClick) {
    return (
      <div role="button" tabIndex={0} onClick={props.onClick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); props.onClick?.(); } }} className={container}>
        {body}
      </div>
    );
  }
  return <div className={container}>{body}</div>;
}
