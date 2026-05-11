import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin,
  Bell,
  Plus,
  Briefcase,
  User,
  Users,
  Hand,
  Home,
  ClipboardList,
  Star,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  Clock,
  X,
  Send,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useTrips } from '@/hooks/useTrips';
import { useMyVacanciesStore, isVacancyActive } from '@/stores/myVacanciesStore';
import {
  useMyApplicationsStore,
  hasActiveApplication,
  applicationOutcome,
} from '@/stores/myApplicationsStore';
import { useTripStateStore, applyOverlay } from '@/stores/tripStateStore';
import { useTripExecutionStore } from '@/stores/tripExecutionStore';
import { tripApproxDriverCost, tripDriverBata } from '@/lib/tripDefaults';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { InstallAppCard } from '@/components/common/InstallAppCard';
import {
  LocationSearchPanel,
  type LocationValue,
} from '@/components/location/LocationSearchPanel';
import { mockCities, mockDrivers } from '@/data/mockData';
import { cn, formatINR, formatKm } from '@/lib/utils';
import { toast } from 'sonner';

const DEFAULT_LOCATION: LocationValue = {
  name: mockCities[0]!.name,
  state: mockCities[0]!.state,
  lat: mockCities[0]!.lat,
  lng: mockCities[0]!.lng,
};

export function DriverHomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useLanguage();
  const { data: allTrips = [] } = useTrips({ status: ['open', 'has_applicants'] });
  // For "Your assigned trips" hero card we need ALL trips (assigned/in-progress)
  // not just open ones. A second query that hits the cache trivially.
  const { data: allTripsAny = [] } = useTrips();
  const overlays = useTripStateStore((s) => s.overlays);
  const executionByTrip = useTripExecutionStore((s) => s.byTrip);

  const myDriver = useMemo(
    () => mockDrivers.find((d) => d.userId === user?.id),
    [user],
  );
  const myDriverId = myDriver?.id;

  const myAssignedTrips = useMemo(() => {
    if (!myDriverId) return [];
    return allTripsAny
      .map((t) => applyOverlay(t, overlays))
      .filter(
        (t) =>
          t.assignedDriverId === myDriverId &&
          (t.status === 'assigned' ||
            t.status === 'in_progress' ||
            t.status === 'completed'),
      );
  }, [allTripsAny, overlays, myDriverId]);

  const activeAssignedCount = useMemo(
    () =>
      myAssignedTrips.filter((t) => {
        const ex = executionByTrip[t.id];
        if (ex?.completedAt) return false;
        if (t.status === 'completed') return false;
        return true;
      }).length,
    [myAssignedTrips, executionByTrip],
  );

  const [currentCity, setCurrentCity] = useState<LocationValue>(DEFAULT_LOCATION);
  const [pickerOpen, setPickerOpen] = useState(false);

  const myVacancies = useMyVacanciesStore((s) => s.vacancies);
  const cancelVacancy = useMyVacanciesStore((s) => s.cancelVacancy);
  const extendVacancy = useMyVacanciesStore((s) => s.extendVacancy);
  const myActiveVacancy = useMemo(() => {
    const now = Date.now();
    return myVacancies.find((v) => isVacancyActive(v, now));
  }, [myVacancies]);

  const applications = useMyApplicationsStore((s) => s.byTrip);

  // Summary for the "My applications" home card. `total` counts live (non-
  // withdrawn) applications; `pending` / `selected` break that down using
  // the trip overlays (manager's decision).
  const applicationsSummary = useMemo(() => {
    const tripById = new Map(allTripsAny.map((t) => [t.id, applyOverlay(t, overlays)]));
    let total = 0;
    let pending = 0;
    let selected = 0;
    for (const app of Object.values(applications)) {
      if (app.withdrawnAt) continue;
      const outcome = applicationOutcome(app, tripById.get(app.tripId), myDriverId);
      if (outcome === 'gone') continue;
      total += 1;
      if (outcome === 'pending') pending += 1;
      else if (outcome === 'selected') selected += 1;
    }
    return { total, pending, selected };
  }, [applications, allTripsAny, overlays, myDriverId]);

  const trips = useMemo(
    () =>
      allTrips.filter(
        (trip) =>
          trip.fromCity.name.toLowerCase() === currentCity.name.toLowerCase(),
      ),
    [allTrips, currentCity.name],
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <header className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Welcome back</div>
          <div className="font-semibold">{user?.displayName}</div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Alerts"
          onClick={() => navigate('/driver/alerts')}
        >
          <Bell className="size-5" />
        </Button>
      </header>

      {/* Compact location chip + map-search picker + primary CTA */}
      <div className="px-4 pt-3 pb-4 space-y-3">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-label="Change current location"
          className="flex items-center gap-1.5 text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full pl-3 pr-2 py-1.5 hover:bg-emerald-100 active:bg-emerald-200 transition-colors"
        >
          <MapPin className="size-3.5" />
          <span className="font-semibold">{currentCity.name}</span>
          <span className="text-emerald-600/80 text-xs">· tap to change</span>
          <ChevronDown
            className={cn(
              'size-3.5 transition-transform',
              pickerOpen && 'rotate-180',
            )}
          />
        </button>

        {pickerOpen && (
          <LocationSearchPanel
            title="Set current location"
            onPick={(loc) => {
              setCurrentCity(loc);
              setPickerOpen(false);
            }}
            onClose={() => setPickerOpen(false)}
          />
        )}

        {/* Hub — every flow from one place */}
        <div className="grid grid-cols-3 gap-2.5">
          <HubTile
            icon={<Plus className="size-5" />}
            label="Post Trip"
            tone="violet"
            onClick={() => navigate('/manager/post-trip')}
          />
          <HubTile
            icon={<Hand className="size-5" />}
            label="Post Vacancy"
            tone="emerald"
            onClick={() => navigate('/driver/post-vacancy')}
          />
          <HubTile
            icon={<FolderOpen className="size-5" />}
            label="Posted Trips"
            tone="cyan"
            onClick={() => navigate('/manager/posted-trips')}
          />
          <HubTile
            icon={<Briefcase className="size-5" />}
            label="Trips"
            tone="blue"
            onClick={() => navigate('/driver/trips')}
          />
          <HubTile
            icon={<Users className="size-5" />}
            label="Vacant"
            tone="amber"
            onClick={() => navigate('/driver/vacancies')}
          />
        </div>

        {/* Your reputation — drivers live for this */}
        {myDriver && (
          <button
            type="button"
            onClick={() => myDriverId && navigate(`/drivers/${myDriverId}`)}
            className="w-full flex items-center gap-3 rounded-xl border bg-white px-3 py-2.5 text-left hover:border-primary/40 transition-colors"
          >
            <div className="size-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <Star className="size-5 fill-amber-500 text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">
                {myDriver.ratingCount > 0
                  ? `⭐ ${myDriver.ratingAvg.toFixed(1)} · ${myDriver.totalTripsCompleted} trips`
                  : `${myDriver.totalTripsCompleted} trips · no ratings yet`}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {myDriver.topTags.length > 0
                  ? `Passengers say: "${myDriver.topTags.join(', ')}"`
                  : 'Complete trips to build your rating'}
              </div>
            </div>
            <ChevronRight className="size-4 text-muted-foreground shrink-0" />
          </button>
        )}
      </div>

      {/* Install / Add to Home Screen */}
      <div className="px-4 pb-4">
        <InstallAppCard dismissable />
      </div>

      {/* My assigned trips — only when there are active assignments */}
      {activeAssignedCount > 0 && (
        <div className="px-4 pb-4">
          <Card
            className="border-blue-200 bg-blue-50/50 cursor-pointer hover:border-blue-300 transition-colors"
            onClick={() => navigate('/driver/my-trips')}
          >
            <CardContent className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 shrink-0">
                <Briefcase className="size-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">
                  You have {activeAssignedCount} assigned trip{activeAssignedCount > 1 ? 's' : ''}
                </div>
                <div className="text-xs text-muted-foreground">
                  Tap to see passenger info, manager contact, and start/complete actions.
                </div>
              </div>
              <Badge variant="info">{activeAssignedCount}</Badge>
            </CardContent>
          </Card>
        </div>
      )}

      {/* My applications — only when the driver has live (non-withdrawn) ones */}
      {applicationsSummary.total > 0 && (
        <div className="px-4 pb-4">
          <Card
            className="cursor-pointer hover:border-primary/40 transition-colors"
            onClick={() => navigate('/driver/my-applications')}
          >
            <CardContent className="flex items-center gap-3">
              <div className="size-10 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 shrink-0">
                <Send className="size-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm">
                  You've applied to {applicationsSummary.total} trip
                  {applicationsSummary.total > 1 ? 's' : ''}
                </div>
                <div className="text-xs text-muted-foreground">
                  {applicationsSummary.pending > 0
                    ? `${applicationsSummary.pending} awaiting decision`
                    : 'No applications awaiting a decision'}
                  {applicationsSummary.selected > 0 &&
                    ` · ${applicationsSummary.selected} selected 🎉`}
                </div>
              </div>
              {applicationsSummary.selected > 0 ? (
                <Badge variant="success">{applicationsSummary.selected} ✓</Badge>
              ) : (
                <Badge variant="muted">{applicationsSummary.total}</Badge>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* My Active Vacancy — only when the driver has one running */}
      {myActiveVacancy && (
        <div className="px-4 pb-4">
          <Card className="border-emerald-200 bg-emerald-50/50">
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-emerald-800 font-semibold">
                  <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                  Your active vacancy
                </div>
                <Badge variant="success" className="text-[10px] flex items-center gap-1">
                  <Clock className="size-3" />
                  {timeLeft(myActiveVacancy.availableUntil)}
                </Badge>
              </div>

              <div className="font-bold text-sm">
                {myActiveVacancy.from.name}
                <span className="text-muted-foreground"> → </span>
                {myActiveVacancy.destinations.map((d, i) => (
                  <span key={`${d.lat}-${d.lng}-${i}`}>
                    {i > 0 && <span className="text-muted-foreground"> · </span>}
                    {d.name}
                  </span>
                ))}
              </div>

              <div className="text-xs text-muted-foreground">
                {myActiveVacancy.vehicleLabel}
                {myActiveVacancy.minRatePerKm != null && (
                  <span> · ≥ ₹{myActiveVacancy.minRatePerKm}/km</span>
                )}
              </div>

              <div className="flex items-center gap-2 pt-2 border-t">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    extendVacancy(myActiveVacancy.id, 4);
                    toast.success('Extended by 4 hours');
                  }}
                  className="flex-1 text-xs"
                >
                  +4h
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate('/driver/my-vacancies')}
                  className="flex-1 text-xs"
                >
                  Manage <ChevronRight className="size-3" />
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive text-xs"
                  onClick={() => {
                    if (!confirm('Cancel your active vacancy?')) return;
                    cancelVacancy(myActiveVacancy.id);
                    toast.success('Vacancy cancelled');
                  }}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Trip feed — a short preview; the Trips tile / bottom-nav opens the full list */}
      <div className="px-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-lg">
            Trips from {currentCity.name}
          </h2>
          <Badge variant="muted">{trips.length} matching</Badge>
        </div>

        {trips.length === 0 ? (
          <Card className="text-center py-8 text-sm text-muted-foreground">
            <CardContent>
              <MapPin className="size-6 mx-auto mb-2 opacity-40" />
              <div className="font-medium text-foreground mb-1">
                No trips from {currentCity.name} right now
              </div>
              <div className="text-xs">
                Try a different location, or post your vacancy so trip managers
                can find you.
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {trips.slice(0, 3).map((trip) => (
              <Card
                key={trip.id}
                className="cursor-pointer hover:border-primary/40"
                onClick={() => navigate(`/driver/trips/${trip.id}`)}
              >
                <CardContent>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="font-bold text-base">
                        {trip.fromCity.name} → {trip.toCity.name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatKm(trip.expectedDistanceKm)} ·{' '}
                        {new Date(trip.pickupDateTime).toLocaleString('en-IN', {
                          weekday: 'short',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-lg">
                        {formatINR(tripApproxDriverCost(trip))}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        payout · ₹{tripDriverBata(trip)} bata incl.
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{trip.carTypeRequired}</Badge>
                    {trip.acRequired && <Badge variant="outline">AC</Badge>}
                    <Badge variant="muted">₹{trip.ratePerKm}/km</Badge>
                    {trip.applicantCount > 0 && (
                      <Badge variant="warning">
                        {trip.applicantCount} applied
                      </Badge>
                    )}
                    {hasActiveApplication(trip.id, applications) && (
                      <Badge variant="success">✓ You applied</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
            <button
              type="button"
              onClick={() => navigate('/driver/trips')}
              className="w-full rounded-xl border border-dashed bg-white py-3 text-sm font-semibold text-primary hover:bg-primary/5 transition-colors"
            >
              {trips.length > 3 ? `See all ${trips.length} trips` : 'Open trips · filter & search'} →
            </button>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t py-2 flex items-center justify-around">
        <NavItem icon={<Home className="size-5" />} label={t('tabs.home')} active />
        <NavItem
          icon={<Briefcase className="size-5" />}
          label={t('tabs.trips')}
          onClick={() => navigate('/driver/trips')}
        />
        <NavItem
          icon={<ClipboardList className="size-5" />}
          label={t('tabs.my_trips')}
          onClick={() => navigate('/driver/my-trips')}
        />
        <NavItem
          icon={<User className="size-5" />}
          label={t('tabs.profile')}
          onClick={() => navigate('/profile')}
        />
      </nav>
    </div>
  );
}

function timeLeft(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  if (diffMs <= 0) return 'expiring';
  const mins = Math.round(diffMs / 60_000);
  if (mins < 60) return `${mins}m left`;
  const hrs = mins / 60;
  if (hrs < 24) return `${Math.round(hrs)}h left`;
  return `${Math.round(hrs / 24)}d left`;
}

function NavItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1 px-3 py-1 ${
        active ? 'text-primary' : 'text-muted-foreground'
      }`}
    >
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

type HubTone = 'violet' | 'emerald' | 'purple' | 'blue' | 'amber' | 'cyan';

function HubTile({
  icon,
  label,
  tone,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  tone: HubTone;
  onClick: () => void;
}) {
  const palette: Record<HubTone, string> = {
    violet: 'bg-violet-100 text-violet-700',
    emerald: 'bg-emerald-100 text-emerald-700',
    purple: 'bg-purple-100 text-purple-700',
    blue: 'bg-blue-100 text-blue-700',
    amber: 'bg-amber-100 text-amber-700',
    cyan: 'bg-cyan-100 text-cyan-700',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center justify-center gap-1.5 rounded-xl border bg-white p-3 text-center transition-colors hover:border-primary/40 active:bg-gray-50"
    >
      <span
        className={cn(
          'size-9 rounded-full flex items-center justify-center',
          palette[tone],
        )}
      >
        {icon}
      </span>
      <span className="text-[11px] font-semibold leading-tight">{label}</span>
    </button>
  );
}
