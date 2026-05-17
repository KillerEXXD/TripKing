import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

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
];

/**
 * Sticky top chip rail — lets you hop between the 5 prototype skins
 * while viewing the same screen-equivalent. Active chip uses the
 * current skin's `--color-primary`, so it re-tints per direction.
 */
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

export function SkinSwitcher() {
  const location = useLocation();
  const activePath = SKINS.find((s) => location.pathname === s.path || location.pathname.startsWith(`${s.path}/`))?.path;
  return (
    <nav
      aria-label="Switch prototype skin"
      className="sticky top-0 z-40 flex items-center gap-1.5 overflow-x-auto border-b border-border bg-page/95 px-3 py-2 backdrop-blur"
    >
      <Link
        to="/administration/designs"
        aria-label="Back to Design previews"
        className="inline-flex shrink-0 items-center gap-1 rounded-pill border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:border-primary/40 hover:text-foreground"
      >
        <ArrowLeft className="size-3" aria-hidden /> Designs
      </Link>
      <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
      {SKINS.map((s) => {
        const active = s.path === activePath;
        const target = swapPrefix(location.pathname, activePath, s.path);
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
            <span className="ml-1 hidden text-[10px] font-normal opacity-80 sm:inline">
              · {s.hint}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export default SkinSwitcher;
