import { Link } from 'react-router-dom';

interface DirectionLink {
  to: string;
  name: string;
  tagline: string;
  optimizedFor: string;
}

const DIRECTIONS: DirectionLink[] = [
  {
    to: '/v2/operator/trips',
    name: 'Operator Console',
    tagline: 'Linear for fleets — dense tables, monochrome, state-as-accent.',
    optimizedFor: 'Power agents and admins',
  },
  {
    to: '/v2/field/trips',
    name: 'Field Companion',
    tagline: 'One thumb at 60 km/h — navy, sunrise-orange CTA, one decision per screen.',
    optimizedFor: 'Drivers actively on the road',
  },
  {
    to: '/v2/pipeline/trips',
    name: 'Pipeline Board',
    tagline: 'Trello for trip lifecycle — pastel columns by state, swipe between them.',
    optimizedFor: 'Agents juggling many trips',
  },
];

/**
 * /v2 — landing page for the three prototype directions. Mobile-first list
 * of links so the user can open each in a tab and compare side-by-side.
 */
export function V2IndexPage() {
  return (
    <div className="mx-auto max-w-md p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">v2 design prototypes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Three alternate trip-list designs. Same data, same hooks — different presentation.
        </p>
      </header>
      <ul className="space-y-3">
        {DIRECTIONS.map((d) => (
          <li key={d.to}>
            <Link
              to={d.to}
              className="block rounded-card border border-border bg-surface p-4 shadow-card transition-colors hover:border-primary/40"
            >
              <div className="text-base font-semibold">{d.name}</div>
              <div className="mt-1 text-sm text-muted-foreground">{d.tagline}</div>
              <div className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">
                For: {d.optimizedFor}
              </div>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-xs text-muted-foreground">
        v1 is unchanged. Visit <Link to="/trips" className="underline">/trips</Link> for the current design.
      </p>
    </div>
  );
}

export default V2IndexPage;
