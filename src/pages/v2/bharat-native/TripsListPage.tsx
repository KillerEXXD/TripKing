import { useState } from 'react';
import { Layers, MapPin, Sparkles, CheckCircle, XCircle } from 'lucide-react';
import { useTrips } from '@/hooks/useTrips';
import { EmptyState, ErrorState, LoadingSkeleton } from '@/components/feedback';
import type { TripStatus } from '@/types';
import { BilingualText } from '@/components/v2/bharat-native/BilingualText';
import { BharatTripCard } from '@/components/v2/bharat-native/BharatTripCard';
import { IconFilterTile } from '@/components/v2/bharat-native/IconFilterTile';

type Filter = 'all' | 'open' | 'mine' | 'done' | 'cancelled';

const FILTERS: { key: Filter; ta: string; en: string; icon: typeof Layers }[] = [
  { key: 'all', ta: 'அனைத்து', en: 'All', icon: Layers },
  { key: 'open', ta: 'புதிய', en: 'New', icon: Sparkles },
  { key: 'mine', ta: 'என்னுடைய', en: 'Mine', icon: MapPin },
  { key: 'done', ta: 'முடிந்த', en: 'Done', icon: CheckCircle },
  { key: 'cancelled', ta: 'ரத்து', en: 'Cancelled', icon: XCircle },
];

const ALL_STATUSES: TripStatus[] = ['open', 'has_applicants', 'accepted', 'in_progress', 'completed', 'cancelled'];

export function BharatTripsListPage() {
  const [filter, setFilter] = useState<Filter>('all');

  const query = useTrips({ status: ALL_STATUSES });
  const trips = query.data ?? [];

  const visible = trips.filter((t) => {
    switch (filter) {
      case 'all':
        return true;
      case 'open':
        return t.status === 'open' || t.status === 'has_applicants';
      case 'mine':
        return t.status === 'accepted' || t.status === 'in_progress';
      case 'done':
        return t.status === 'completed';
      case 'cancelled':
        return t.status === 'cancelled';
    }
  });

  return (
    <div className="mx-auto max-w-md pb-12">
      <header className="bg-primary px-4 pb-4 pt-6 text-primary-foreground">
        <BilingualText as="h1" ta="டிரிப்கள்" en="Trips" size="lg" />
        <p className="mt-1 text-[13px] opacity-90">{trips.length} டிரிப்கள் · {trips.length} trips</p>
      </header>
      <div role="tablist" aria-label="Filter" className="flex gap-2 overflow-x-auto bg-surface-muted px-4 py-3">
        {FILTERS.map((f) => (
          <IconFilterTile
            key={f.key}
            icon={f.icon}
            ta={f.ta}
            en={f.en}
            active={filter === f.key}
            onClick={() => setFilter(f.key)}
          />
        ))}
      </div>
      <div className="space-y-3 p-4">
        {query.isLoading ? (
          <LoadingSkeleton rows={3} />
        ) : query.isError ? (
          <ErrorState message="Couldn't load trips." onRetry={() => query.refetch()} />
        ) : visible.length === 0 ? (
          <EmptyState title="டிரிப்கள் இல்லை · No trips" message="Try a different filter." />
        ) : (
          visible.map((t) => <BharatTripCard key={t.id} trip={t} />)
        )}
      </div>
    </div>
  );
}

export default BharatTripsListPage;
