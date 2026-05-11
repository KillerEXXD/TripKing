import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Clock,
  ChevronRight,
  PlayCircle,
  CheckCircle2,
  Inbox,
  Briefcase,
  Trash2,
  MapPin,
} from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useTrips } from '@/hooks/useTrips';
import { useTripStateStore, applyOverlay } from '@/stores/tripStateStore';
import { useTripExecutionStore } from '@/stores/tripExecutionStore';
import {
  useMyApplicationsStore,
  applicationOutcome,
  timeAgo,
  type ApplicationOutcome,
  type MyApplication,
} from '@/stores/myApplicationsStore';
import {
  useMyVacanciesStore,
  isVacancyActive,
  type MyVacancy,
} from '@/stores/myVacanciesStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { mockDrivers } from '@/data/mockData';
import { cn, formatINR, formatKm } from '@/lib/utils';
import { tripApproxDriverCost, tripDriverBata } from '@/lib/tripDefaults';
import { toast } from 'sonner';
import type { Trip } from '@/types';

type Tab = 'trips' | 'applications' | 'vacancies';
const TABS: { id: Tab; label: string }[] = [
  { id: 'trips', label: 'Trips' },
  { id: 'applications', label: 'Applications' },
  { id: 'vacancies', label: 'Vacancies' },
];

/**
 * Driver's "My Trips" — one place, three tabs:
 *  - Trips: trips assigned to you (In progress / Upcoming / Completed)
 *  - Applications: trips you applied to (Awaiting / Selected / Closed)
 *  - Vacancies: availability you posted (Active / History)
 */
export function MyActivityPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'trips';
  const setTab = (t: Tab) => setParams(t === 'trips' ? {} : { tab: t }, { replace: true });

  const { data: allTrips = [] } = useTrips();
  const overlays = useTripStateStore((s) => s.overlays);
  const executionByTrip = useTripExecutionStore((s) => s.byTrip);
  const byTrip = useMyApplicationsStore((s) => s.byTrip);
  const withdraw = useMyApplicationsStore((s) => s.withdraw);
  const vacancies = useMyVacanciesStore((s) => s.vacancies);
  const cancelVacancy = useMyVacanciesStore((s) => s.cancelVacancy);
  const extendVacancy = useMyVacanciesStore((s) => s.extendVacancy);

  const myDriverId = useMemo(
    () => mockDrivers.find((d) => d.userId === user?.id)?.id,
    [user],
  );

  const tripById = useMemo(() => {
    const m = new Map<string, Trip>();
    for (const t of allTrips) m.set(t.id, applyOverlay(t, overlays));
    return m;
  }, [allTrips, overlays]);

  // --- Assigned trips ---
  const assigned = useMemo(() => {
    if (!myDriverId) return { inProgress: [] as Trip[], upcoming: [] as Trip[], done: [] as Trip[] };
    const mine = [...tripById.values()].filter(
      (t) =>
        t.assignedDriverId === myDriverId &&
        (t.status === 'assigned' || t.status === 'in_progress' || t.status === 'completed'),
    );
    const inProgress: Trip[] = [];
    const upcoming: Trip[] = [];
    const done: Trip[] = [];
    for (const t of mine) {
      const ex = executionByTrip[t.id];
      if (ex?.completedAt || t.status === 'completed') done.push(t);
      else if (ex?.startedAt || t.status === 'in_progress') inProgress.push(t);
      else upcoming.push(t);
    }
    return { inProgress, upcoming, done };
  }, [tripById, executionByTrip, myDriverId]);

  // --- Applications ---
  const apps = useMemo(() => {
    const rows = Object.values(byTrip).map((app) => {
      const t = tripById.get(app.tripId);
      return { app, trip: t, outcome: applicationOutcome(app, t, myDriverId) };
    });
    rows.sort((a, b) => new Date(b.app.appliedAt).getTime() - new Date(a.app.appliedAt).getTime());
    const pending = rows.filter((r) => r.outcome === 'pending');
    const selected = rows.filter((r) => r.outcome === 'selected');
    const closed = rows.filter((r) => !['pending', 'selected'].includes(r.outcome));
    return { pending, selected, closed, total: rows.length };
  }, [byTrip, tripById, myDriverId]);

  // --- Vacancies ---
  const now = Date.now();
  const vac = useMemo(() => {
    const active: MyVacancy[] = [];
    const past: MyVacancy[] = [];
    for (const v of vacancies) {
      if (v.status !== 'cancelled' && isVacancyActive(v, now)) active.push(v);
      else past.push(v);
    }
    return { active, past };
  }, [vacancies, now]);

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/home')} aria-label="Home">
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="font-semibold flex-1">My Trips</h1>
        {tab === 'vacancies' && (
          <Button size="sm" onClick={() => navigate('/driver/post-vacancy')}>
            <Plus className="size-4" /> New
          </Button>
        )}
      </header>

      {/* Tab bar */}
      <div className="bg-white border-b px-2 flex">
        {TABS.map((tt) => (
          <button
            key={tt.id}
            type="button"
            onClick={() => setTab(tt.id)}
            className={cn(
              'flex-1 py-2.5 text-sm font-semibold border-b-2 transition-colors',
              tab === tt.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tt.label}
          </button>
        ))}
      </div>

      <div className="p-4 space-y-5">
        {tab === 'trips' && (
          <>
            {assigned.inProgress.length + assigned.upcoming.length + assigned.done.length === 0 && (
              <Empty
                icon={<Briefcase className="size-8 mx-auto opacity-30" />}
                title="No assigned trips yet"
                hint="Apply to open trips — once a manager picks you, they show up here."
                cta="Browse trips"
                onCta={() => navigate('/driver/trips')}
              />
            )}
            <TripSection title="In progress" tone="info" icon={<PlayCircle className="size-4 text-blue-700" />} trips={assigned.inProgress} executionByTrip={executionByTrip} onTap={(t) => navigate(`/driver/my-trips/${t.id}`)} />
            <TripSection title="Upcoming" tone="warning" icon={<Clock className="size-4 text-amber-600" />} trips={assigned.upcoming} executionByTrip={executionByTrip} onTap={(t) => navigate(`/driver/my-trips/${t.id}`)} />
            <TripSection title="Completed" tone="muted" icon={<CheckCircle2 className="size-4 text-emerald-700" />} trips={assigned.done} executionByTrip={executionByTrip} onTap={(t) => navigate(`/driver/my-trips/${t.id}`)} dim />
          </>
        )}

        {tab === 'applications' && (
          <>
            {apps.total === 0 && (
              <Empty
                icon={<Inbox className="size-8 mx-auto opacity-30" />}
                title="No applications yet"
                hint="Apply to open trips and they'll show here while you wait for the manager's decision."
                cta="Browse trips"
                onCta={() => navigate('/driver/trips')}
              />
            )}
            <AppSection title="Awaiting decision" tone="warning" icon={<Clock className="size-4 text-amber-600" />} rows={apps.pending} onTap={(r) => navigate(`/driver/trips/${r.app.tripId}`)} onWithdraw={(id) => { if (confirm('Withdraw your application for this trip?')) { withdraw(id); toast.success('Application withdrawn'); } }} />
            <AppSection title="Selected" tone="info" icon={<CheckCircle2 className="size-4 text-emerald-700" />} rows={apps.selected} onTap={() => navigate('/driver/my-trips?tab=trips')} />
            <AppSection title="Closed" tone="muted" icon={<Inbox className="size-4 text-gray-500" />} rows={apps.closed} onTap={(r) => navigate(`/driver/trips/${r.app.tripId}`)} dim />
          </>
        )}

        {tab === 'vacancies' && (
          <>
            {vacancies.length === 0 && (
              <Empty
                icon={<MapPin className="size-8 mx-auto opacity-30" />}
                title="No vacancies yet"
                hint="Post your availability so trip managers can find you."
                cta="Post Vacancy"
                onCta={() => navigate('/driver/post-vacancy')}
              />
            )}
            <VacSection title="Active" tone="info" trips={vac.active} now={now} onExtend={(v) => { extendVacancy(v.id, 4); toast.success(`${v.from.name} → … extended by 4h`); }} onCancel={(v) => { if (confirm('Cancel this vacancy?')) { cancelVacancy(v.id); toast.success('Vacancy cancelled'); } }} />
            <VacSection title="History" tone="muted" trips={vac.past} now={now} dim />
          </>
        )}
      </div>
    </div>
  );
}

// =====================
// Sub-components
// =====================

function Empty({ icon, title, hint, cta, onCta }: { icon: React.ReactNode; title: string; hint: string; cta: string; onCta: () => void }) {
  return (
    <Card className="text-center py-10">
      <CardContent className="space-y-2">
        {icon}
        <div className="font-semibold">{title}</div>
        <div className="text-sm text-muted-foreground">{hint}</div>
        <Button className="mx-auto mt-2" onClick={onCta}>{cta}</Button>
      </CardContent>
    </Card>
  );
}

type Tone = 'info' | 'warning' | 'muted';
function dotFor(tone: Tone) {
  return tone === 'info' ? 'bg-blue-500' : tone === 'warning' ? 'bg-amber-500' : 'bg-gray-400';
}
function SectionHead({ title, tone, icon, count }: { title: string; tone: Tone; icon?: React.ReactNode; count: number }) {
  return (
    <div className="flex items-center gap-2 px-1">
      <span className={cn('size-2 rounded-full', dotFor(tone))} />
      <h2 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        {icon} {title}
      </h2>
      <Badge variant="muted">{count}</Badge>
    </div>
  );
}

function TripSection({ title, tone, icon, trips, executionByTrip, onTap, dim }: { title: string; tone: Tone; icon: React.ReactNode; trips: Trip[]; executionByTrip: Record<string, { startedAt?: string; completedAt?: string }>; onTap: (t: Trip) => void; dim?: boolean }) {
  if (trips.length === 0) return null;
  return (
    <section className="space-y-2">
      <SectionHead title={title} tone={tone} icon={icon} count={trips.length} />
      <div className="space-y-2">
        {trips.map((t) => {
          const ex = executionByTrip[t.id];
          const status = ex?.completedAt || t.status === 'completed' ? 'Completed' : ex?.startedAt || t.status === 'in_progress' ? 'In progress' : 'Ready to start';
          return (
            <Card key={t.id} className={cn('cursor-pointer hover:border-primary/40 transition-colors', dim && 'opacity-80', tone === 'info' && !dim && 'border-blue-200 bg-blue-50/30', tone === 'warning' && !dim && 'border-amber-200 bg-amber-50/30')} onClick={() => onTap(t)}>
              <CardContent>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold truncate">{t.fromCity.name} → {t.toCity.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatKm(t.expectedDistanceKm)} · pickup {new Date(t.pickupDateTime).toLocaleString('en-IN', { weekday: 'short', hour: 'numeric', minute: '2-digit', day: 'numeric', month: 'short' })}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold">{formatINR(tripApproxDriverCost(t))}</div>
                    <div className="text-[10px] text-muted-foreground">incl. ₹{tripDriverBata(t)} bata</div>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <Badge variant={status === 'Completed' ? 'muted' : status === 'In progress' ? 'info' : 'success'}>{status}</Badge>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

interface AppRow { app: MyApplication; trip?: Trip; outcome: ApplicationOutcome }
const OUTCOME_LABEL: Record<ApplicationOutcome, { label: string; badge: 'warning' | 'success' | 'outline' | 'destructive' }> = {
  pending: { label: 'Awaiting decision', badge: 'warning' },
  selected: { label: 'You were selected 🎉', badge: 'success' },
  not_selected: { label: 'Not selected', badge: 'outline' },
  withdrawn: { label: 'Withdrawn', badge: 'outline' },
  cancelled: { label: 'Trip cancelled', badge: 'destructive' },
  gone: { label: 'No longer available', badge: 'outline' },
};
function AppSection({ title, tone, icon, rows, onTap, onWithdraw, dim }: { title: string; tone: Tone; icon: React.ReactNode; rows: AppRow[]; onTap: (r: AppRow) => void; onWithdraw?: (tripId: string) => void; dim?: boolean }) {
  if (rows.length === 0) return null;
  return (
    <section className="space-y-2">
      <SectionHead title={title} tone={tone} icon={icon} count={rows.length} />
      <div className="space-y-2">
        {rows.map((r) => {
          const meta = OUTCOME_LABEL[r.outcome];
          return (
            <Card key={r.app.tripId} className={cn('cursor-pointer hover:border-primary/40 transition-colors', dim && 'opacity-80', tone === 'warning' && !dim && 'border-amber-200 bg-amber-50/30', tone === 'info' && !dim && 'border-emerald-200 bg-emerald-50/30')} onClick={() => onTap(r)}>
              <CardContent>
                <div className="flex items-start justify-between gap-2 mb-1">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold truncate">{r.trip ? `${r.trip.fromCity.name} → ${r.trip.toCity.name}` : 'Trip no longer available'}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.trip && `${formatKm(r.trip.expectedDistanceKm)} · `}applied {timeAgo(r.app.appliedAt)}
                    </div>
                  </div>
                  {r.trip && (
                    <div className="text-right shrink-0">
                      <div className="font-bold">{formatINR(tripApproxDriverCost(r.trip))}</div>
                      <div className="text-[10px] text-muted-foreground">incl. ₹{tripDriverBata(r.trip)} bata</div>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={meta.badge}>{meta.label}</Badge>
                    {r.app.quotedRatePerKm != null && <span className="text-muted-foreground">your quote: ₹{r.app.quotedRatePerKm}/km</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {onWithdraw && r.outcome === 'pending' && (
                      <button type="button" className="text-destructive hover:underline font-medium" onClick={(e) => { e.stopPropagation(); onWithdraw(r.app.tripId); }}>Withdraw</button>
                    )}
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function expiryLabel(iso: string, now: number): string {
  const diffMs = new Date(iso).getTime() - now;
  const past = diffMs < 0;
  const mins = Math.round(Math.abs(diffMs) / 60_000);
  const hrs = mins / 60;
  const rel = mins < 60 ? `${mins}m` : hrs < 24 ? `${Math.round(hrs)}h` : `${Math.round(hrs / 24)}d`;
  return past ? `expired ${rel} ago` : `${rel} left`;
}
function VacSection({ title, tone, trips, now, onExtend, onCancel, dim }: { title: string; tone: Tone; trips: MyVacancy[]; now: number; onExtend?: (v: MyVacancy) => void; onCancel?: (v: MyVacancy) => void; dim?: boolean }) {
  if (trips.length === 0) return null;
  return (
    <section className="space-y-2">
      <SectionHead title={title} tone={tone} count={trips.length} />
      <div className="space-y-2">
        {trips.map((v) => (
          <Card key={v.id} className={cn('overflow-hidden', dim && 'opacity-70 bg-gray-50', !dim && 'border-emerald-200 bg-emerald-50/30')}>
            <CardContent className="space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-sm">
                    {v.from.name}<span className="text-muted-foreground"> → </span>
                    {v.destinations.map((d, i) => (
                      <span key={`${d.lat}-${d.lng}-${i}`}>{i > 0 && <span className="text-muted-foreground"> · </span>}{d.name}</span>
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{v.vehicleLabel}{v.minRatePerKm != null && <span> · ≥ ₹{v.minRatePerKm}/km</span>}</div>
                </div>
                <Badge variant={v.status === 'cancelled' ? 'destructive' : isVacancyActive(v, now) ? 'success' : 'warning'} className="text-[10px] flex items-center gap-1 shrink-0">
                  <Clock className="size-3" />{v.status === 'cancelled' ? 'Cancelled' : expiryLabel(v.availableUntil, now)}
                </Badge>
              </div>
              {!dim && (onExtend || onCancel) && (
                <div className="flex items-center gap-2 pt-2 border-t">
                  {onExtend && <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => onExtend(v)}>+4h</Button>}
                  {onCancel && <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive text-xs" onClick={() => onCancel(v)}><Trash2 className="size-3.5" /> Cancel</Button>}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
