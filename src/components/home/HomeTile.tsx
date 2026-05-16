import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Props {
  to: string;
  icon: LucideIcon;
  label: string;
  /** Optional one-line stat to render below the label (e.g. "₹2,450 lifetime"). */
  sub?: string;
  /** Tailwind tone helpers — pick a colour family per tile. */
  tone?: 'teal' | 'blue' | 'emerald' | 'amber' | 'violet';
  ariaLabel?: string;
}

const TONE: Record<NonNullable<Props['tone']>, { iconBg: string; iconFg: string; ring: string; }> = {
  teal:    { iconBg: 'bg-teal-100',    iconFg: 'text-teal-700',    ring: 'hover:border-teal-300' },
  blue:    { iconBg: 'bg-blue-100',    iconFg: 'text-blue-700',    ring: 'hover:border-blue-300' },
  emerald: { iconBg: 'bg-emerald-100', iconFg: 'text-emerald-700', ring: 'hover:border-emerald-300' },
  amber:   { iconBg: 'bg-amber-100',   iconFg: 'text-amber-700',   ring: 'hover:border-amber-300' },
  violet:  { iconBg: 'bg-violet-100',  iconFg: 'text-violet-700',  ring: 'hover:border-violet-300' },
};

/**
 * Square home-tab tile with rounded corners. Renders inside a 3-col grid (or any
 * column count). The container forces aspect-square so the layout stays clean
 * regardless of label length or whether `sub` is present.
 */
export function HomeTile({ to, icon: Icon, label, sub, tone = 'teal', ariaLabel }: Props) {
  const t = TONE[tone];
  return (
    <Link
      to={to}
      aria-label={ariaLabel ?? label}
      className={`group flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white p-3 text-center transition active:scale-[0.98] ${t.ring} hover:shadow-sm`}
    >
      <div className={`flex size-10 items-center justify-center rounded-full ${t.iconBg} ${t.iconFg}`}>
        <Icon className="size-5" aria-hidden />
      </div>
      <div className="text-sm font-semibold leading-tight text-slate-900">{label}</div>
      {sub ? <div className="text-[11px] leading-tight text-slate-500">{sub}</div> : null}
    </Link>
  );
}

export default HomeTile;
