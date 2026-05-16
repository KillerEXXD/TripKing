import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  /** Title line — 17px bold (the redesign's --text-header token). */
  title: ReactNode;
  /** Optional secondary line below the title; muted colour, 11px. */
  subtitle?: ReactNode;
  /**
   * Back link target. When set, renders a `<ArrowLeft>` icon button on the
   * left and navigates to that route on click. Omit on top-level tabs
   * (Home, Vacancies, etc.) — they have no back affordance. Mutually
   * exclusive with `onBack`: pass one or the other.
   */
  backTo?: string;
  /**
   * Custom back handler. Use this when the destination isn't a static route
   * — history.back(), conditional routing, "pop the modal first" flows.
   * Mutually exclusive with `backTo`.
   */
  onBack?: () => void;
  /**
   * Optional right-aligned slot — a notification bell, an avatar, a "+"
   * FAB-as-header-button. Pass whatever JSX makes sense; the header just
   * places it.
   */
  right?: ReactNode;
  className?: string;
}

/**
 * The redesign's single page-header component. Replaces every inline
 * `<header>...</header>` block across the app — that pattern was the #1
 * source of style drift (each page reimplemented padding, border,
 * back-arrow, title size). After PR 7, `grep src/pages -r '<header'`
 * returns zero.
 *
 * Visual: white surface, soft 1px bottom shadow (shadow-header token),
 * sticky to the top of the scroll container so the page bg slides
 * underneath as the user scrolls.
 */
export function PageHeader({ title, subtitle, backTo, onBack, right, className }: PageHeaderProps) {
  const backButtonClass = '-ml-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-muted';
  return (
    <header
      className={cn(
        'sticky top-0 z-10 -mx-4 mb-3 flex items-center gap-2 bg-surface px-4 py-3 shadow-header',
        className,
      )}
    >
      {backTo ? (
        <Link to={backTo} aria-label="Back" className={backButtonClass}>
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
      ) : onBack ? (
        <button type="button" onClick={onBack} aria-label="Back" className={backButtonClass}>
          <ArrowLeft className="size-5" aria-hidden />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-header font-bold leading-tight">{title}</h1>
        {subtitle ? (
          <p className="truncate text-micro text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </header>
  );
}
