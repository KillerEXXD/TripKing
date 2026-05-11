import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Users, Share2, Navigation } from 'lucide-react';
import { useTrips } from '@/hooks/useTrips';
import { useTripStateStore, applyOverlay } from '@/stores/tripStateStore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShareTripModal } from '@/components/share/ShareTripModal';
import { TripTracking } from '@/components/TripTracking';
import { cn, formatINR, formatKm } from '@/lib/utils';
import { tripDriverBata } from '@/lib/tripDefaults';
import type { Trip, TripStatus } from '@/types';

const TAB_KEYS = [
  'all',
  'open',
  'has_applicants',
  'assigned',
  'in_progress',
  'completed',
  'cancelled',
] as const;

type TabKey = (typeof TAB_KEYS)[number];

const TABS: { key: TabKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'has_applicants', label: 'Has Applicants' },
  { key: 'assigned', label: 'Assigned' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

function isTabKey(v: string | null): v is TabKey {
  return v != null && (TAB_KEYS as readonly string[]).includes(v);
}

export function PostedTripsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const statusParam = searchParams.get('status');
  const tab: TabKey = isTabKey(statusParam) ? statusParam : 'all';

  const setTab = (next: TabKey) => {
    if (next === 'all') setSearchParams({}, { replace: true });
    else setSearchParams({ status: next }, { replace: true });
  };

  const { data: trips = [] } = useTrips();
  const overlays = useTripStateStore((s) => s.overlays);
  const [shareTrip, setShareTrip] = useState<Trip | null>(null);

  // Merge user actions (assignments + cancellations) onto base mock trips so
  // tab counts + filter results reflect the manager's recent actions.
  const mergedTrips = useMemo(
    () => trips.map((t) => applyOverlay(t, overlays)),
    [trips, overlays],
  );

  const filtered =
    tab === 'all'
      ? mergedTrips
      : mergedTrips.filter((t) => t.status === (tab as TripStatus));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/manager')}>
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="font-semibold">My Posted Trips</h1>
      </header>

      {/* Tab strip */}
      <div className="bg-white border-b px-2 py-2 overflow-x-auto whitespace-nowrap">
        {TABS.map((t) => {
          const count =
            t.key === 'all'
              ? mergedTrips.length
              : mergedTrips.filter((x) => x.status === t.key).length;
          const active = tab === t.key;
          return (
            <button
              type="button"
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold mr-1 transition-colors',
                active
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-gray-100 text-muted-foreground hover:bg-gray-200',
              )}
            >
              {t.label} <span className="opacity-70">· {count}</span>
            </button>
          );
        })}
      </div>

      <div className="p-4 space-y-3">
        {filtered.length === 0 && (
          <div className="text-center text-muted-foreground py-12 text-sm">
            No trips in this category.
          </div>
        )}
        {filtered.map((trip) => (
          <Card
            key={trip.id}
            className={cn(
              'cursor-pointer hover:border-primary/40 active:scale-[0.99] transition-all',
              trip.applicantCount > 0 && trip.status === 'has_applicants'
                ? 'border-amber-200 bg-amber-50/30'
                : '',
            )}
            onClick={() => navigate(`/manager/posted-trips/${trip.id}/applicants`)}
          >
            <CardContent>
              <div className="flex items-start justify-between mb-2 gap-2">
                <div className="min-w-0">
                  <div className="font-bold truncate">
                    {trip.fromCity.name} → {trip.toCity.name}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {formatKm(trip.expectedDistanceKm)} · ₹{trip.ratePerKm}/km ·{' '}
                    {formatINR(trip.totalFare)} · +₹{tripDriverBata(trip)} bata
                  </div>
                </div>
                <Badge
                  variant={
                    trip.status === 'has_applicants'
                      ? 'warning'
                      : trip.status === 'assigned'
                        ? 'success'
                        : trip.status === 'in_progress'
                          ? 'info'
                          : trip.status === 'completed'
                            ? 'muted'
                            : trip.status === 'cancelled'
                              ? 'destructive'
                              : 'info'
                  }
                >
                  {trip.status.replace('_', ' ')}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  Pickup: {new Date(trip.pickupDateTime).toLocaleString('en-IN')}
                </span>
                {trip.applicantCount > 0 && (
                  <Badge variant="warning" className="flex items-center gap-1">
                    <Users className="size-3" /> {trip.applicantCount} applicant
                    {trip.applicantCount > 1 ? 's' : ''}
                  </Badge>
                )}
              </div>

              {trip.status === 'in_progress' && (
                <div className="mt-2 pt-2 border-t">
                  <TripTracking trip={trip} variant="summary" />
                </div>
              )}

              {/* Review CTA — louder on cards with applicants since that's the
                  manager's most-frequent next action. Share icon on the left
                  for quick re-share to WhatsApp/Telegram (hidden once the
                  trip is no longer applyable). */}
              <div className="flex items-center justify-between mt-2 pt-2 border-t text-xs font-semibold">
                {trip.status === 'open' || trip.status === 'has_applicants' ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShareTrip(trip);
                    }}
                    aria-label="Share this trip"
                    className="flex items-center gap-1 text-emerald-700 hover:text-emerald-800 px-2 py-1 -ml-2 rounded-md hover:bg-emerald-50"
                  >
                    <Share2 className="size-3.5" />
                    Share
                  </button>
                ) : (
                  <span />
                )}
                <span className="flex items-center text-primary">
                  {trip.status === 'in_progress' ? (
                    <>
                      <Navigation className="size-3 mr-1" />
                      Track trip
                    </>
                  ) : trip.applicantCount > 0 && trip.status === 'has_applicants' ? (
                    'Review applicants'
                  ) : (
                    'View details'
                  )}
                  <ChevronRight className="size-3.5 ml-0.5" />
                </span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {shareTrip && (
        <ShareTripModal
          trip={shareTrip}
          open={shareTrip !== null}
          onClose={() => setShareTrip(null)}
        />
      )}
    </div>
  );
}
