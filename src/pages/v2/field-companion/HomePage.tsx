import { Link } from 'react-router-dom';
import { ArrowRight, Bell } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTrips } from '@/hooks/useTrips';
import type { TripStatus } from '@/types';
import { StickyCtaBar } from '@/components/v2/field-companion/StickyCtaBar';

const APPLY_STATUSES: TripStatus[] = ['open', 'has_applicants'];

/**
 * v2 Field Companion — home. Big greeting, single huge CTA, glanceable
 * "trips near you" count. Designed for the driver who just opened
 * the app at a chai stall.
 */
export function FieldHomePage() {
  const { user } = useAuth();
  const query = useTrips({ status: APPLY_STATUSES });
  const count = query.data?.length ?? 0;
  const firstName = (user?.displayName ?? user?.phone ?? 'driver').split(' ')[0];

  return (
    <div className="min-h-dvh pb-32">
      <header className="flex items-center justify-between px-5 pt-6">
        <div className="text-[14px] uppercase tracking-wide text-muted-foreground">Good evening</div>
        <button type="button" aria-label="Notifications" className="rounded-pill bg-surface p-2.5">
          <Bell className="size-5" />
        </button>
      </header>

      <h1 className="px-5 pt-1 text-[28px] font-bold leading-tight">{firstName}.</h1>

      <section className="mx-5 mt-6 rounded-card bg-surface p-6 shadow-card">
        <div className="text-[14px] uppercase tracking-wide text-muted-foreground">Trips nearby</div>
        <div className="mt-2 text-[64px] font-bold leading-none">{count}</div>
        <div className="mt-3 text-[15px] text-muted-foreground">
          {count === 0 ? 'Nothing in your radius right now.' : `${count === 1 ? 'trip' : 'trips'} you can apply to`}
        </div>
      </section>

      <Link
        to="/v3/trips"
        className="mt-4 mx-5 flex items-center justify-between rounded-card bg-surface p-5 shadow-card"
      >
        <div>
          <div className="text-[12px] uppercase tracking-wide text-muted-foreground">Browse</div>
          <div className="text-[18px] font-semibold">All trips</div>
        </div>
        <ArrowRight className="size-5 text-primary" />
      </Link>

      <StickyCtaBar>
        <Link
          to="/v3/trips"
          className="block h-14 w-full rounded-control bg-primary text-center text-[17px] font-semibold leading-[3.5rem] text-primary-foreground shadow-fab"
        >
          Find trips near me
        </Link>
      </StickyCtaBar>
    </div>
  );
}

export default FieldHomePage;
