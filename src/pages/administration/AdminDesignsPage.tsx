import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, ChevronRight, ExternalLink, LayoutGrid, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SKIN_PAGES } from '@/components/v2/shared/skinPages';

interface DesignRoute {
  label: string;
  /** Sub-path under the design's prefix (matches SKIN_PAGES.sub). */
  sub: string;
}

interface Design {
  path: `/v${number}`;
  name: string;
  tagline: string;
  optimizedFor: string;
  swatchClass: string;
  /** Pulled from SKIN_PAGES to keep both tabs and SkinSwitcher in sync. */
  routes: DesignRoute[];
}

const ROUTES: DesignRoute[] = SKIN_PAGES.map((p) => ({ label: p.cardLabel, sub: p.sub }));

const DESIGNS: Design[] = [
  {
    path: '/v2',
    name: 'Operator Console',
    tagline: 'Linear-for-fleets — dense monochrome tables, state-as-accent.',
    optimizedFor: 'Power agents + admins',
    swatchClass: 'bg-zinc-900',
    routes: ROUTES,
  },
  {
    path: '/v3',
    name: 'Field Companion',
    tagline: 'One thumb at 60 km/h — navy, sunrise CTA, one decision per screen.',
    optimizedFor: 'Drivers on the road',
    swatchClass: 'bg-[#0b1d3a]',
    routes: ROUTES,
  },
  {
    path: '/v4',
    name: 'Pipeline Board',
    tagline: 'Trello for trip lifecycle — pastel columns by state, swipe between.',
    optimizedFor: 'Agents juggling many trips',
    swatchClass: 'bg-indigo-600',
    routes: ROUTES,
  },
  {
    path: '/v5',
    name: 'Editorial',
    tagline: 'Magazine — cream + serif italic, asymmetric feature cards.',
    optimizedFor: 'Premium / acquisition',
    swatchClass: 'bg-[#0f766e]',
    routes: ROUTES,
  },
  {
    path: '/v6',
    name: 'Bharat-Native',
    tagline: 'Tier-2 India first — bilingual Tamil/English, big numerals, festive.',
    optimizedFor: 'Mass-market Indian drivers',
    swatchClass: 'bg-[#312e81]',
    routes: ROUTES,
  },
  {
    path: '/v7',
    name: 'Simple Mode',
    tagline: 'Built for clarity — high-contrast colors, one decision per screen, English.',
    optimizedFor: 'Low-literacy users — drivers and agents new to apps',
    swatchClass: 'bg-[#16a34a]',
    routes: ROUTES,
  },
];

const DEFAULT_DESIGN: `/v${number}` = '/v2';

type Tab = 'pages' | 'design';

/**
 * Admin → Designs. Two-tab launchpad for the prototype skins:
 *
 * Pages tab — list of 9 page names. Tap one → lands on /v2{sub}?nav=pages,
 *             where the SkinSwitcher renders VERSION chips (compare same
 *             screen across all 6 designs).
 *
 * Design tab — list of 6 designs (current grouping). Tap a design's Open
 *             button or a sub-route → lands on /vN{sub}?nav=design, where
 *             the SkinSwitcher renders PAGE chips (walk through all pages
 *             within that one design).
 */
export function AdminDesignsPage() {
  const [tab, setTab] = useState<Tab>('design');
  // The design tile on Home navigates here; users expect to land at the top of the page,
  // not at whatever scroll position they had on Home. Mount-only scroll is fine — the page
  // doesn't re-mount across tab changes (those are state-driven, not route-driven).
  useEffect(() => { window.scrollTo(0, 0); }, []);

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-6">
      {/* Back returns to Home (the Design Previews tile is on Home). For admins who reached
          this from /administration, browser back still works. */}
      <Link to="/" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Home
      </Link>
      <header>
        <h1 className="text-2xl font-bold">Design previews</h1>
        <p className="mt-1 text-sm text-secondary">
          Six alternate UI directions, nine screens each. Browse by <strong>Pages</strong> to compare a
          single screen across designs, or by <strong>Design</strong> to walk all screens within one direction.
        </p>
      </header>

      {/* Dual-card toggle (not SegmentedTabs) — the pill segmented control was too subtle
          here; reviewers were missing that this is a TWO-WAY view. Each toggle is a full
          card with icon + label + helper line so both modes are visible at a glance, and
          the active state has a strong emerald ring + check icon. */}
      <div id="design-group-label" className="text-xs font-semibold uppercase tracking-wide text-secondary">Group by</div>
      <div role="group" aria-labelledby="design-group-label" className="grid grid-cols-2 gap-3">
        <ViewToggleCard
          active={tab === 'pages'}
          onClick={() => setTab('pages')}
          icon={<Layers className="size-5" aria-hidden />}
          label="Pages"
          helper="Compare one screen across all 6 designs"
        />
        <ViewToggleCard
          active={tab === 'design'}
          onClick={() => setTab('design')}
          icon={<LayoutGrid className="size-5" aria-hidden />}
          label="Design"
          helper="Walk all 9 screens within one direction"
        />
      </div>

      {tab === 'pages' ? <PagesTab /> : <DesignTab />}
    </main>
  );
}

function PagesTab() {
  return (
    <>
      <p className="text-xs text-secondary">
        Tap a page → lands on it in v2 (default). Use the chip rail at the top of the page to switch designs.
      </p>
      <ul className="space-y-2">
        {SKIN_PAGES.map((p) => (
          <li key={p.sub || '_home'}>
            <Link
              to={`${DEFAULT_DESIGN}${p.sub}?nav=pages`}
              className="flex items-center justify-between rounded-card bg-surface px-4 py-3 shadow-card transition-colors hover:border-primary/40"
            >
              <span>
                <span className="text-sm font-semibold">{p.cardLabel}</span>
                <span className="ml-2 font-mono text-xs text-secondary">{DEFAULT_DESIGN}{p.sub}</span>
              </span>
              <ChevronRight className="size-4 text-secondary" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

function DesignTab() {
  return (
    <ul className="space-y-3">
      {DESIGNS.map((d) => (
        <li key={d.path} className="rounded-card bg-surface p-4 shadow-card">
          <div className="flex items-start gap-3">
            <span aria-hidden className={`mt-1 inline-block size-6 shrink-0 rounded-full ${d.swatchClass}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-secondary">{d.path}</span>
                <h2 className="text-base font-semibold">{d.name}</h2>
              </div>
              <p className="mt-0.5 text-sm text-secondary">{d.tagline}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-secondary">For: {d.optimizedFor}</p>
            </div>
            <Link
              to={`${d.path}?nav=design`}
              className="shrink-0 self-center rounded-pill bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
            >
              Open <ExternalLink className="inline size-3" aria-hidden />
            </Link>
          </div>
          <nav aria-label={`${d.name} screens`} className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {d.routes.map((r) => (
              <Link
                key={`${d.path}-${r.sub || '_home'}`}
                to={`${d.path}${r.sub}?nav=design`}
                className="flex items-center justify-between rounded-control px-2 py-1.5 text-sm hover:bg-muted"
              >
                <span>
                  <span className="text-foreground">{r.label}</span>
                  <span className="ml-2 font-mono text-xs text-secondary">{d.path}{r.sub}</span>
                </span>
                <ChevronRight className="size-3.5 text-secondary" aria-hidden />
              </Link>
            ))}
          </nav>
        </li>
      ))}
    </ul>
  );
}

/**
 * Active state: emerald ring + tinted background + check badge — reads as "this is the
 * selected view" at a glance. Inactive state: bordered card with hover, clearly clickable.
 * Both halves of the toggle stay visible side-by-side so first-time users immediately see
 * there are TWO ways to browse the designs (the original pill SegmentedTabs was too subtle).
 */
function ViewToggleCard({
  active,
  onClick,
  icon,
  label,
  helper,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  helper: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active ? 'true' : 'false'}
      onClick={onClick}
      className={cn(
        'group flex flex-col items-start gap-1.5 rounded-card border-2 p-4 text-left transition-all',
        active
          ? 'border-emerald-500 bg-emerald-50 shadow-card'
          : 'border-input bg-surface hover:border-emerald-300 hover:bg-emerald-50/40',
      )}
    >
      <div className="flex w-full items-center justify-between">
        <span className={cn('inline-flex size-9 items-center justify-center rounded-full', active ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-secondary')}>
          {icon}
        </span>
        {active ? (
          <span className="inline-flex size-5 items-center justify-center rounded-full bg-emerald-600 text-white">
            <Check className="size-3" aria-hidden />
          </span>
        ) : null}
      </div>
      <div className={cn('text-base font-bold', active ? 'text-emerald-900' : 'text-foreground')}>{label}</div>
      <div className={cn('text-xs leading-snug', active ? 'text-emerald-800' : 'text-secondary')}>{helper}</div>
    </button>
  );
}

export default AdminDesignsPage;
