import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { SKIN_PAGES } from './skinPages';

interface Skin {
  path: `/v${number}`;
  label: string;
  hint: string;
}

const SKINS: Skin[] = [
  { path: '/v2', label: 'v2', hint: 'Operator Console' },
  { path: '/v3', label: 'v3', hint: 'Field Companion' },
  { path: '/v4', label: 'v4', hint: 'Pipeline Board' },
  { path: '/v5', label: 'v5', hint: 'Editorial' },
  { path: '/v6', label: 'v6', hint: 'Bharat-Native' },
  { path: '/v7', label: 'v7', hint: 'Simple Mode' },
];

/**
 * Re-write a path's /vN prefix to the new skin's /vN. So a viewer on
 * /v2/trips/abc tapping the v3 chip lands on /v3/trips/abc — same
 * screen-equivalent, different design.
 */
function swapPrefix(pathname: string, currentPrefix: string | undefined, nextPrefix: string): string {
  if (!currentPrefix) return nextPrefix;
  const rest = pathname.slice(currentPrefix.length); // '' or '/...'
  return `${nextPrefix}${rest}`;
}

/** Append `?nav=<mode>` (preserving any other params) when a mode is in play. */
function withNav(path: string, params: URLSearchParams, mode: 'pages' | 'design' | null): string {
  if (!mode) return path;
  const next = new URLSearchParams(params);
  next.set('nav', mode);
  return `${path}?${next.toString()}`;
}

/**
 * Sticky top chip rail. Behaviour depends on the `?nav` query param:
 *
 *   ?nav=pages   → version chips (default). Tapping a chip swaps the /vN
 *                  prefix and keeps the sub-route — same screen, different design.
 *   ?nav=design  → page chips. Tapping a chip swaps the sub-route and keeps
 *                  the /vN prefix — same design, different page.
 *   (no nav)     → same as `nav=pages` (back-compat for bookmarked direct URLs).
 *
 * The "← Designs" back link is always the first item.
 */
export function SkinSwitcher() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const navParam = searchParams.get('nav');
  const mode: 'pages' | 'design' | null = navParam === 'design' ? 'design' : navParam === 'pages' ? 'pages' : null;

  const activeSkin = SKINS.find((s) => location.pathname === s.path || location.pathname.startsWith(`${s.path}/`));
  const showPageChips = mode === 'design';

  return (
    <nav
      aria-label={showPageChips ? 'Switch page within this design' : 'Switch prototype skin'}
      className="sticky top-0 z-40 flex flex-wrap items-center gap-1.5 border-b border-border bg-page/95 px-3 py-2 backdrop-blur"
    >
      <Link
        to="/administration/designs"
        aria-label="Back to Design previews"
        className="inline-flex shrink-0 items-center gap-1 rounded-pill border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
      >
        <ArrowLeft className="size-3" aria-hidden /> Designs
      </Link>
      <span aria-hidden className="h-4 w-px shrink-0 bg-border" />

      {showPageChips ? (
        <PageChips activeSkinPath={activeSkin?.path ?? '/v2'} pathname={location.pathname} params={searchParams} />
      ) : (
        <DesignChips activeSkinPath={activeSkin?.path} pathname={location.pathname} params={searchParams} mode={mode} />
      )}
    </nav>
  );
}

function DesignChips({
  activeSkinPath, pathname, params, mode,
}: {
  activeSkinPath: `/v${number}` | undefined;
  pathname: string;
  params: URLSearchParams;
  mode: 'pages' | 'design' | null;
}) {
  return (
    <>
      {SKINS.map((s) => {
        const active = s.path === activeSkinPath;
        const target = withNav(swapPrefix(pathname, activeSkinPath, s.path), params, mode);
        return (
          <Link
            key={s.path}
            to={target}
            aria-current={active ? 'page' : undefined}
            className={`shrink-0 rounded-pill px-3 py-1 text-[11px] font-semibold transition-colors ${
              active
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-surface text-foreground hover:border-primary/40'
            }`}
          >
            <span>{s.label}</span>
            <span className="ml-1 hidden text-[10px] font-normal opacity-80 sm:inline">· {s.hint}</span>
          </Link>
        );
      })}
    </>
  );
}

function PageChips({
  activeSkinPath, pathname, params,
}: {
  activeSkinPath: `/v${number}`;
  pathname: string;
  params: URLSearchParams;
}) {
  const subPath = pathname.startsWith(activeSkinPath) ? pathname.slice(activeSkinPath.length) : '';
  return (
    <>
      {SKIN_PAGES.map((p) => {
        const active = p.sub === subPath || (p.sub === '/trips' && subPath.startsWith('/trips/') && subPath !== '/trips/new');
        const target = withNav(`${activeSkinPath}${p.sub}`, params, 'design');
        return (
          <Link
            key={p.sub || '_home'}
            to={target}
            aria-current={active ? 'page' : undefined}
            className={`shrink-0 rounded-pill px-3 py-1 text-[11px] font-semibold transition-colors ${
              active
                ? 'bg-primary text-primary-foreground'
                : 'border border-border bg-surface text-foreground hover:border-primary/40'
            }`}
          >
            {p.chipLabel}
          </Link>
        );
      })}
    </>
  );
}

export default SkinSwitcher;
