import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronRight, ExternalLink } from 'lucide-react';

interface DesignRoute {
  label: string;
  to: string;
}

interface Design {
  path: `/v${number}`;
  name: string;
  tagline: string;
  optimizedFor: string;
  swatchClass: string;       // primary colour swatch (Tailwind)
  routes: DesignRoute[];
}

const DESIGNS: Design[] = [
  {
    path: '/v2',
    name: 'Operator Console',
    tagline: 'Linear-for-fleets — dense monochrome tables, state-as-accent.',
    optimizedFor: 'Power agents + admins',
    swatchClass: 'bg-zinc-900',
    routes: [
      { label: 'Home (dashboard)', to: '/v2' },
      { label: 'Trips list (dense table)', to: '/v2/trips' },
      { label: 'Trip detail', to: '/v2/trips' },
      { label: 'Profile', to: '/v2/profile' },
      { label: 'My trips', to: '/v2/my-trips' },
      { label: 'Notifications', to: '/v2/notifications' },
    ],
  },
  {
    path: '/v3',
    name: 'Field Companion',
    tagline: 'One thumb at 60 km/h — navy, sunrise CTA, one decision per screen.',
    optimizedFor: 'Drivers on the road',
    swatchClass: 'bg-[#0b1d3a]',
    routes: [
      { label: 'Home (hero greeting)', to: '/v3' },
      { label: 'Trips list (hero cards)', to: '/v3/trips' },
      { label: 'Trip detail (timeline)', to: '/v3/trips' },
      { label: 'Profile', to: '/v3/profile' },
      { label: 'My trips', to: '/v3/my-trips' },
      { label: 'Notifications', to: '/v3/notifications' },
    ],
  },
  {
    path: '/v4',
    name: 'Pipeline Board',
    tagline: 'Trello for trip lifecycle — pastel columns by state, swipe between.',
    optimizedFor: 'Agents juggling many trips',
    swatchClass: 'bg-indigo-600',
    routes: [
      { label: 'Home (column overview)', to: '/v4' },
      { label: 'Trips board', to: '/v4/trips' },
      { label: 'Trip detail (stages)', to: '/v4/trips' },
      { label: 'Profile', to: '/v4/profile' },
      { label: 'My applications (board)', to: '/v4/my-trips' },
      { label: 'Notifications', to: '/v4/notifications' },
    ],
  },
  {
    path: '/v5',
    name: 'Editorial',
    tagline: 'Magazine — cream + serif italic, asymmetric feature cards.',
    optimizedFor: 'Premium / acquisition',
    swatchClass: 'bg-[#0f766e]',
    routes: [
      { label: 'Home (magazine cover)', to: '/v5' },
      { label: 'Trips (feature spread)', to: '/v5/trips' },
      { label: 'Trip detail (full bleed)', to: '/v5/trips' },
      { label: 'Profile (the contributor)', to: '/v5/profile' },
      { label: 'My trips (in progress)', to: '/v5/my-trips' },
      { label: 'Dispatches', to: '/v5/notifications' },
    ],
  },
  {
    path: '/v6',
    name: 'Bharat-Native',
    tagline: 'Tier-2 India first — bilingual Tamil/English, big numerals, festive.',
    optimizedFor: 'Mass-market Indian drivers',
    swatchClass: 'bg-[#312e81]',
    routes: [
      { label: 'Home (icon menu)', to: '/v6' },
      { label: 'Trips list', to: '/v6/trips' },
      { label: 'Trip detail (4 tiles)', to: '/v6/trips' },
      { label: 'Profile', to: '/v6/profile' },
      { label: 'My trips', to: '/v6/my-trips' },
      { label: 'Notifications', to: '/v6/notifications' },
    ],
  },
];

/**
 * Admin → Designs. Lists the 5 v2-v6 prototype skins with deep links into
 * each direction's screens. The SkinSwitcher chip rail at the top of every
 * /vN page lets you hop between equivalents while inside a design.
 */
export function AdminDesignsPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-5 p-6">
      <Link to="/administration" className="-ml-1 inline-flex items-center gap-1 text-sm text-secondary hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Administration
      </Link>
      <header>
        <h1 className="text-2xl font-bold">Design previews</h1>
        <p className="mt-1 text-sm text-secondary">
          Five alternate UI directions under <code className="font-mono">/v2</code>–<code className="font-mono">/v6</code>.
          Same hooks, same data — different design language. Tap any direction's Home, or jump
          directly to a screen. Inside each design a sticky chip rail lets you hop between the five.
        </p>
      </header>

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
                to={d.path}
                className="shrink-0 self-center rounded-pill bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
              >
                Open <ExternalLink className="inline size-3" aria-hidden />
              </Link>
            </div>
            <nav aria-label={`${d.name} screens`} className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {d.routes.map((r) => (
                <Link
                  key={`${d.path}-${r.label}`}
                  to={r.to}
                  className="flex items-center justify-between rounded-control px-2 py-1.5 text-sm hover:bg-muted"
                >
                  <span>
                    <span className="text-foreground">{r.label}</span>
                    <span className="ml-2 font-mono text-xs text-secondary">{r.to}</span>
                  </span>
                  <ChevronRight className="size-3.5 text-secondary" aria-hidden />
                </Link>
              ))}
            </nav>
          </li>
        ))}
      </ul>

      <p className="rounded-card border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <strong>Note:</strong> the prototype currently covers 6 screens per direction (home, trips list,
        trip detail, profile, my-trips, notifications). Other v1 routes (post-trip form, vacancies,
        wallet, KYC, admin pages, etc.) still render in v1. Pick a direction and we expand it.
      </p>
    </main>
  );
}

export default AdminDesignsPage;
