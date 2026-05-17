import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTrips } from '@/hooks/useTrips';
import { LoadingSkeleton } from '@/components/feedback';
import { formatINR, formatPickupTime } from '@/lib/utils';
import { EditorialMasthead } from '@/components/v2/editorial/EditorialMasthead';
import type { TripStatus } from '@/types';

const STATUSES: TripStatus[] = ['open', 'has_applicants'];

/**
 * v2 Editorial — home. A magazine cover. Masthead + a "today's
 * headline" trip + a short "in this issue" list. No CTAs that scream;
 * everything reads.
 */
export function EditorialHomePage() {
  const { user } = useAuth();
  const query = useTrips({ status: STATUSES });
  const trips = query.data ?? [];
  const headline = trips[0];

  return (
    <div className="mx-auto max-w-md px-6 pb-12">
      <EditorialMasthead
        issue={`Vol. ${new Date().getFullYear()}`}
        title="Today's edition"
        subtitle={`Curated for ${user?.displayName ?? 'you'}. ${trips.length} live ${trips.length === 1 ? 'feature' : 'features'} ahead.`}
      />

      {query.isLoading ? (
        <div className="pt-8"><LoadingSkeleton rows={3} /></div>
      ) : headline ? (
        <article className="pt-8">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">The headline</div>
          <Link to={`/v5/trips/${headline.id}`} className="group block">
            <h2 className="editorial-headline mt-2 text-[34px] leading-[0.95] group-hover:text-primary">
              {headline.fromCity?.name ?? '—'} <span className="italic text-muted-foreground">to</span> {headline.toCity?.name ?? '—'}
            </h2>
            <p className="mt-3 text-[14px] italic text-muted-foreground">
              {formatPickupTime(headline.pickupAt)} · {Math.round(headline.expectedDistanceKm)} km · driver's share {formatINR(headline.driverPayout)}.
            </p>
            <div className="mt-3 inline-flex items-center gap-1 border-b border-foreground pb-0.5 text-[12px] uppercase tracking-wide">
              read the feature <ArrowRight className="size-3" aria-hidden />
            </div>
          </Link>
        </article>
      ) : null}

      {trips.length > 1 ? (
        <section className="mt-12 border-t border-foreground/30 pt-6">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">In this issue</div>
          <ul className="mt-3 divide-y divide-border">
            {trips.slice(1, 5).map((t) => (
              <li key={t.id}>
                <Link
                  to={`/v5/trips/${t.id}`}
                  className="flex items-baseline justify-between gap-3 py-3 hover:text-primary"
                >
                  <span className="editorial-headline text-[18px]">
                    {t.fromCity?.name ?? '—'} <span className="italic text-muted-foreground">to</span> {t.toCity?.name ?? '—'}
                  </span>
                  <span className="text-[12px] text-muted-foreground">{formatINR(t.driverPayout)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Link
        to="/v5/trips"
        className="mt-10 inline-flex items-center gap-2 text-[12px] uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        Browse all features <ArrowRight className="size-3" aria-hidden />
      </Link>
    </div>
  );
}

export default EditorialHomePage;
