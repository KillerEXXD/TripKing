import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Search,
  Star,
  ChevronRight,
  Car,
  Snowflake,
  Filter,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { mockDrivers } from '@/data/mockData';
import { initials, cn } from '@/lib/utils';
import type { CarType, KycStatus } from '@/types';

type SortKey = 'rating' | 'trips' | 'recent' | 'name';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'rating', label: 'Top rated' },
  { key: 'trips', label: 'Most trips' },
  { key: 'recent', label: 'Newest' },
  { key: 'name', label: 'A–Z' },
];

const KYC_FILTERS: { key: KycStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All KYC' },
  { key: 'approved', label: 'Approved' },
  { key: 'video_pending', label: 'Video pending' },
  { key: 'docs_submitted', label: 'Docs submitted' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'resubmit_required', label: 'Resubmit needed' },
];

const CAR_TYPES: CarType[] = [
  'Hatchback',
  'Sedan',
  'SUV',
  'Innova',
  'Tempo Traveller',
  'Mini Bus',
];

const KYC_VARIANT: Record<KycStatus, 'success' | 'warning' | 'destructive' | 'info' | 'muted'> = {
  pending: 'info',
  docs_submitted: 'info',
  video_pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
  resubmit_required: 'warning',
};

const KYC_LABEL: Record<KycStatus, string> = {
  pending: 'Pending',
  docs_submitted: 'Docs submitted',
  video_pending: 'Video pending',
  approved: 'Approved',
  rejected: 'Rejected',
  resubmit_required: 'Resubmit',
};

/**
 * Admin → Drivers list with rich search + sort + filter.
 *
 * Searches across: name, nickname, vehicle make/model/registration, phone,
 * home city. Sorts by rating / trips / recent / name. Filter chips for
 * KYC status + car-type + AC-only.
 *
 * Each row taps through to the public driver profile (reused) — admin can
 * see the same view managers see, plus extra info via /admin/kyc when needed.
 */
export function AdminDriversPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('rating');
  const [kycFilter, setKycFilter] = useState<KycStatus | 'all'>('all');
  const [carType, setCarType] = useState<CarType | 'all'>('all');
  const [acOnly, setAcOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    const matched = mockDrivers.filter((d) => {
      if (kycFilter !== 'all' && d.kycStatus !== kycFilter) return false;

      const primary = d.vehicles.find((v) => v.isPrimary) ?? d.vehicles[0];
      if (!primary) return false;

      if (carType !== 'all' && primary.carType !== carType) return false;
      if (acOnly && !primary.ac) return false;

      if (!q) return true;
      const haystack = [
        d.fullName,
        d.phone,
        d.email ?? '',
        d.homeCity.name,
        d.currentCity.name,
        primary.make,
        primary.model,
        String(primary.year),
        primary.registrationNumber,
        primary.carType,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });

    matched.sort((a, b) => {
      switch (sortKey) {
        case 'rating':
          return b.ratingAvg - a.ratingAvg;
        case 'trips':
          return b.totalTripsCompleted - a.totalTripsCompleted;
        case 'recent':
          // mockDrivers don't carry createdAt; approximate by trip count desc
          // for the prototype. Real impl would sort by users.created_at desc.
          return b.totalTripsCompleted - a.totalTripsCompleted;
        case 'name':
          return a.fullName.localeCompare(b.fullName);
      }
    });

    return matched;
  }, [query, sortKey, kycFilter, carType, acOnly]);

  const hasActiveFilter =
    query.trim() !== '' || kycFilter !== 'all' || carType !== 'all' || acOnly;

  const counts = useMemo(() => {
    const total = mockDrivers.length;
    const approved = mockDrivers.filter((d) => d.kycStatus === 'approved').length;
    const pending = mockDrivers.filter(
      (d) => d.kycStatus !== 'approved' && d.kycStatus !== 'rejected',
    ).length;
    const ratingAvg =
      mockDrivers.reduce((s, d) => s + d.ratingAvg, 0) / Math.max(1, total);
    return { total, approved, pending, ratingAvg };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/admin')}>
          <ArrowLeft className="size-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold truncate">Drivers</h1>
          <div className="text-xs text-muted-foreground">
            {filtered.length} of {counts.total}
            {hasActiveFilter && ' (filtered)'}
          </div>
        </div>
      </header>

      {/* KPI strip */}
      <div className="bg-white border-b px-4 py-3 grid grid-cols-3 gap-2 text-center">
        <KpiTile label="Approved" value={counts.approved} variant="success" />
        <KpiTile label="Pending" value={counts.pending} variant="warning" />
        <KpiTile label="Avg ★" value={counts.ratingAvg.toFixed(1)} variant="info" />
      </div>

      {/* Search + filter toggle */}
      <div className="bg-white border-b px-4 py-3 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, vehicle, registration, city…"
            className="pl-9 pr-10"
            inputMode="search"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 size-7 rounded-full hover:bg-muted flex items-center justify-center"
              aria-label="Clear search"
            >
              <X className="size-3.5 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Sort + Filter row */}
        <div className="flex items-center gap-1.5 overflow-x-auto -mx-1 px-1 pb-0.5">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSortKey(s.key)}
              className={cn(
                'shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-colors',
                sortKey === s.key
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border bg-white hover:border-primary/40',
              )}
            >
              {s.label}
            </button>
          ))}
          <div className="shrink-0 w-px h-5 bg-border mx-1" />
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className={cn(
              'shrink-0 px-3 py-1 rounded-full text-xs font-semibold border transition-colors flex items-center gap-1',
              filtersOpen || carType !== 'all' || kycFilter !== 'all' || acOnly
                ? 'bg-blue-100 text-blue-700 border-blue-300'
                : 'border-border bg-white hover:border-primary/40',
            )}
          >
            <Filter className="size-3" /> Filters
            {(carType !== 'all' ? 1 : 0) +
              (kycFilter !== 'all' ? 1 : 0) +
              (acOnly ? 1 : 0) >
              0 && (
              <Badge variant="info" className="text-[9px] ml-0.5">
                {(carType !== 'all' ? 1 : 0) +
                  (kycFilter !== 'all' ? 1 : 0) +
                  (acOnly ? 1 : 0)}
              </Badge>
            )}
          </button>
        </div>

        {filtersOpen && (
          <Card className="p-2 gap-2">
            <CardContent className="space-y-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                  KYC status
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {KYC_FILTERS.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setKycFilter(f.key)}
                      className={cn(
                        'px-3 py-1 rounded-full text-xs font-semibold border transition-colors',
                        kycFilter === f.key
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border bg-white hover:border-primary/40',
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                  Car type
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setCarType('all')}
                    className={cn(
                      'px-3 py-1 rounded-full text-xs font-semibold border transition-colors',
                      carType === 'all'
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border bg-white hover:border-primary/40',
                    )}
                  >
                    All cars
                  </button>
                  {CAR_TYPES.map((ct) => (
                    <button
                      key={ct}
                      type="button"
                      onClick={() => setCarType(ct)}
                      className={cn(
                        'px-3 py-1 rounded-full text-xs font-semibold border transition-colors',
                        carType === ct
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border bg-white hover:border-primary/40',
                      )}
                    >
                      {ct}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAcOnly((v) => !v)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-semibold border transition-colors flex items-center gap-1',
                    acOnly
                      ? 'bg-blue-100 text-blue-700 border-blue-300'
                      : 'border-border bg-white hover:border-primary/40',
                  )}
                >
                  <Snowflake className="size-3" /> AC only
                </button>
                {hasActiveFilter && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      setKycFilter('all');
                      setCarType('all');
                      setAcOnly(false);
                    }}
                    className="ml-auto text-xs text-destructive font-semibold"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* List */}
      <div className="p-4 space-y-2">
        {filtered.length === 0 ? (
          <Card className="text-center py-10">
            <CardContent className="space-y-2">
              <Car className="size-8 mx-auto opacity-30" />
              <div className="font-semibold">No drivers match</div>
              <div className="text-sm text-muted-foreground">
                Try clearing the search or relaxing the filters.
              </div>
            </CardContent>
          </Card>
        ) : (
          filtered.map((d) => {
            const v = d.vehicles.find((x) => x.isPrimary) ?? d.vehicles[0]!;
            return (
              <Card
                key={d.id}
                className="cursor-pointer hover:border-primary/40 active:scale-[0.99] transition-all"
                onClick={() => navigate(`/drivers/${d.id}`)}
              >
                <CardContent>
                  <div className="flex items-center gap-3">
                    <Avatar className="size-12">
                      <AvatarFallback className="text-sm">
                        {initials(d.fullName)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <div className="font-bold text-sm truncate">
                          {d.fullName}
                        </div>
                        <Badge
                          variant={KYC_VARIANT[d.kycStatus]}
                          className="text-[10px] shrink-0"
                        >
                          {KYC_LABEL[d.kycStatus]}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs mt-0.5">
                        {d.ratingCount > 0 ? (
                          <span className="flex items-center gap-1 text-amber-600 font-semibold">
                            <Star className="size-3 fill-amber-500 stroke-amber-500" />
                            {d.ratingAvg.toFixed(1)}
                            <span className="text-muted-foreground font-normal">
                              · {d.totalTripsCompleted} trips
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            New · {d.totalTripsCompleted} trips
                          </span>
                        )}
                        <span className="text-muted-foreground">
                          · {d.currentCity.name}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 truncate">
                        {v.make} {v.model} {v.year}
                        <span className="font-mono ml-1">· {v.registrationNumber}</span>
                      </div>
                    </div>
                    <ChevronRight className="size-4 text-muted-foreground shrink-0" />
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}

function KpiTile({
  label,
  value,
  variant,
}: {
  label: string;
  value: number | string;
  variant: 'success' | 'warning' | 'info';
}) {
  const map = {
    success: 'text-emerald-700 bg-emerald-50 border-emerald-100',
    warning: 'text-amber-700 bg-amber-50 border-amber-100',
    info: 'text-blue-700 bg-blue-50 border-blue-100',
  };
  return (
    <div className={`border rounded-lg p-2 ${map[variant]}`}>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-[9px] uppercase tracking-wider font-semibold opacity-80">
        {label}
      </div>
    </div>
  );
}
