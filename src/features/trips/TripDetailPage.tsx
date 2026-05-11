import { useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  MapPin,
  Clock,
  Users,
  Wallet,
  Phone,
  MessageCircle,
  CheckCircle2,
  ClipboardList,
} from 'lucide-react';
import { useTrip, useTripApplicants } from '@/hooks/useTrips';
import { useGoBack } from '@/hooks/useGoBack';
import {
  useMyApplicationsStore,
  hasActiveApplication,
  timeAgo,
} from '@/stores/myApplicationsStore';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatINR, formatKm, initials } from '@/lib/utils';
import {
  tripApproxDriverCost,
  tripCommissionAmount,
  tripDriverBata,
  tripDriverInstructions,
  tripExtrasPaidByPassenger,
} from '@/lib/tripDefaults';
import { mockManagers, mockUsers } from '@/data/mockData';
import { toast } from 'sonner';

/**
 * Seed trips that already have applicants. When a shared link points at a
 * trip that doesn't exist on this device (cross-device share — a posted
 * trip lives only in the poster's browser), we bounce to one of these so
 * the demo keeps flowing instead of dead-ending on a "not found" page.
 */
const FALLBACK_TRIP_IDS = ['t-1', 't-2', 't-5'];

export function TripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>();
  const goBack = useGoBack('/driver/trips');
  const { data: trip, isLoading } = useTrip(tripId);
  const { data: applicants = [] } = useTripApplicants(tripId);

  const byTrip = useMyApplicationsStore((s) => s.byTrip);
  const apply = useMyApplicationsStore((s) => s.apply);
  const withdraw = useMyApplicationsStore((s) => s.withdraw);
  const myApplication = tripId ? byTrip[tripId] : undefined;
  const isApplied = tripId ? hasActiveApplication(tripId, byTrip) : false;

  const [showQuote, setShowQuote] = useState(false);
  const [quoteRate, setQuoteRate] = useState('');
  const [quoteNote, setQuoteNote] = useState('');

  if (isLoading) return <div className="p-6">Loading…</div>;
  if (!trip) {
    // Cross-device share: this trip lives only in the poster's browser, so
    // it can't be looked up here. Bounce to a seeded trip that already has
    // applicants so the demo keeps flowing.
    const fallback =
      FALLBACK_TRIP_IDS[Math.floor(Math.random() * FALLBACK_TRIP_IDS.length)];
    return <Navigate to={`/driver/trips/${fallback}`} replace />;
  }

  const handleApply = () => {
    if (!tripId) return;
    const rate = parseFloat(quoteRate);
    apply(tripId, {
      quotedRatePerKm: !isNaN(rate) && rate > 0 ? Math.round(rate) : undefined,
      message: quoteNote.trim() || undefined,
    });
    toast.success('Applied — the trip manager has been notified');
  };

  const handleWithdraw = () => {
    if (!tripId) return;
    if (!confirm('Withdraw your application?')) return;
    withdraw(tripId);
    toast.success('Application withdrawn');
  };

  // Resolve who posted this trip — manager or driver lookup by user id.
  const poster = (() => {
    const mgr = mockManagers.find((m) => m.userId === trip.postedByUserId);
    if (mgr) {
      return {
        name: mgr.fullName,
        phone: mgr.phone,
        role: 'Trip Manager',
        sub: mgr.businessName,
      };
    }
    const u = mockUsers.find((x) => x.id === trip.postedByUserId);
    return {
      name: trip.postedByName ?? u?.displayName ?? 'Unknown',
      phone: u?.phone ?? '',
      role: u?.role === 'driver' ? 'Driver' : 'Trip Manager',
      sub: undefined as string | undefined,
    };
  })();

  // Strip non-digits + leading + for tel: href so Android dialers behave
  const telHref = `tel:${poster.phone.replace(/[^\d+]/g, '')}`;
  const smsHref = `sms:${poster.phone.replace(/[^\d+]/g, '')}`;

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={goBack} aria-label="Back">
          <ArrowLeft className="size-5" />
        </Button>
        <h1 className="font-semibold">Trip Detail</h1>
      </header>

      <div className="p-4 space-y-3">
        <Card>
          <CardContent className="space-y-3">
            <div className="text-2xl font-bold">
              {trip.fromCity.name} → {trip.toCity.name}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Stat icon={<MapPin />} label="Distance" value={formatKm(trip.expectedDistanceKm)} />
              <Stat icon={<Clock />} label="Pickup" value={new Date(trip.pickupDateTime).toLocaleString('en-IN')} />
              <Stat icon={<Users />} label="Passengers" value={`${trip.passengerCount} pax`} />
              <Stat icon={<Wallet />} label="Rate" value={`₹${trip.ratePerKm}/km`} />
            </div>
            <div className="flex gap-2">
              <Badge variant="outline">{trip.carTypeRequired}</Badge>
              {trip.acRequired && <Badge variant="outline">AC required</Badge>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-2">
            <div className="font-semibold">Payout breakdown</div>
            <Row label={`Trip cost (${formatKm(trip.expectedDistanceKm)} × ₹${trip.ratePerKm})`} value={formatINR(trip.totalFare)} />
            <Row label={`− Commission (${trip.commissionPct}%)`} value={`− ${formatINR(tripCommissionAmount(trip))}`} muted />
            <Row label="− GST" value={`− ${formatINR(trip.gstAmount)}`} muted />
            <Row label="+ Driver bata" value={`+ ${formatINR(tripDriverBata(trip))}`} />
            <div className="border-t pt-2 flex justify-between font-bold text-emerald-700 text-lg">
              <span>You get (approx.)</span>
              <span>{formatINR(tripApproxDriverCost(trip))}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {tripExtrasPaidByPassenger(trip)
                ? '🧳 Packing, toll & permit — extra, paid by passenger'
                : '🧳 Packing, toll & permit — included in the fare'}
            </div>
          </CardContent>
        </Card>

        {/* Driver instructions */}
        <Card>
          <CardContent className="space-y-2">
            <div className="font-semibold flex items-center gap-1.5">
              <ClipboardList className="size-4 text-muted-foreground" /> Driver instructions
            </div>
            <ol className="list-decimal list-inside space-y-1 text-sm text-gray-700">
              {tripDriverInstructions(trip).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ol>
          </CardContent>
        </Card>

        {/* Posted by — name + phone + Call/SMS CTAs */}
        <Card>
          <CardContent className="space-y-3">
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Posted by
            </div>
            <div className="flex items-center gap-3">
              <Avatar className="size-12">
                <AvatarFallback>{initials(poster.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="font-bold truncate">{poster.name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {poster.role}
                  {poster.sub && ` · ${poster.sub}`}
                </div>
                {poster.phone && (
                  <div className="text-xs font-mono text-muted-foreground mt-0.5">
                    {poster.phone}
                  </div>
                )}
              </div>
            </div>
            {poster.phone && (
              <div className="flex gap-2">
                <Button asChild className="flex-1" size="sm">
                  <a href={telHref} aria-label={`Call ${poster.name}`}>
                    <Phone className="size-4" /> Call
                  </a>
                </Button>
                <Button asChild className="flex-1" size="sm" variant="outline">
                  <a href={smsHref} aria-label={`Message ${poster.name}`}>
                    <MessageCircle className="size-4" /> Message
                  </a>
                </Button>
              </div>
            )}
            <div className="text-[10px] text-muted-foreground italic">
              Tap to call directly. The driver's number stays private until selected.
            </div>
          </CardContent>
        </Card>

        {/* Applied banner — shown on top of the applicant-count banner so the
            driver immediately knows their status. */}
        {isApplied && myApplication && (
          <Card className="border-emerald-200 bg-emerald-50">
            <CardContent className="flex items-start gap-2">
              <CheckCircle2 className="size-5 text-emerald-700 shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-emerald-900 text-sm">
                  You've applied — waiting for the trip manager
                </div>
                <div className="text-xs text-emerald-700">
                  Submitted {timeAgo(myApplication.appliedAt)} · we'll notify
                  you with their decision.
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {applicants.length > 0 && (
          <Card>
            <CardContent className="space-y-3">
              <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                🤝 {applicants.length} driver{applicants.length > 1 ? 's' : ''} applied
              </div>
              <div className="space-y-2.5">
                {applicants.map((a) => (
                  <div key={a.id} className="flex items-center gap-3">
                    <Avatar className="size-10">
                      <AvatarFallback>{initials(a.driver.fullName)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{a.driver.fullName}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        ⭐ {a.driver.ratingAvg.toFixed(1)} ({a.driver.ratingCount}) ·{' '}
                        {a.vehicle.make} {a.vehicle.model} · {a.driver.currentCity.name}
                      </div>
                    </div>
                    {a.applicantQuotedRatePerKm != null && (
                      <span className="text-xs font-semibold text-emerald-700 whitespace-nowrap">
                        ₹{a.applicantQuotedRatePerKm}/km
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="text-[10px] text-muted-foreground italic">
                You're competing with these drivers — a sharp rate helps you stand out.
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Bottom CTA — Apply / Applied */}
      <div className="fixed bottom-0 inset-x-0 bg-white border-t p-4 space-y-2">
        {isApplied ? (
          <>
            <div className="flex items-center justify-center gap-2 px-3 py-3 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold text-sm">
              <CheckCircle2 className="size-4" /> Applied
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-destructive hover:text-destructive"
              onClick={handleWithdraw}
            >
              Withdraw application
            </Button>
          </>
        ) : (
          <>
            {showQuote && (
              <div className="space-y-2 rounded-lg border bg-white p-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground shrink-0">My rate</span>
                  <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                      ₹
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={quoteRate}
                      onChange={(e) => setQuoteRate(e.target.value)}
                      placeholder={String(trip.ratePerKm)}
                      className="w-full h-9 rounded-md border border-input pl-6 pr-2 text-sm outline-none focus-visible:border-ring"
                    />
                  </div>
                  <span className="text-sm text-muted-foreground shrink-0">/km</span>
                </div>
                <input
                  value={quoteNote}
                  onChange={(e) => setQuoteNote(e.target.value)}
                  placeholder="Short note to the manager (optional)"
                  maxLength={140}
                  className="w-full h-9 rounded-md border border-input px-2.5 text-sm outline-none focus-visible:border-ring"
                />
              </div>
            )}
            <button
              type="button"
              onClick={() => setShowQuote((v) => !v)}
              className="w-full text-xs text-muted-foreground hover:text-foreground"
            >
              {showQuote ? 'Hide rate / note ▲' : 'Quote a different rate · add a note ▼'}
            </button>
            <Button
              variant="full"
              size="lg"
              className="w-full"
              onClick={handleApply}
            >
              Apply for this trip
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="text-muted-foreground mt-0.5 [&_svg]:size-4">{icon}</div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-semibold text-sm">{value}</div>
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className={muted ? 'text-muted-foreground' : ''}>{label}</span>
      <span className={muted ? 'text-muted-foreground' : 'font-medium'}>{value}</span>
    </div>
  );
}
