import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Calendar, Car, KeyRound, MapPin, MessageCircle, Phone, ShieldCheck, Wallet } from 'lucide-react';
import { useTripByOtp } from '@/hooks/useTrips';
import { TripTracking } from '@/components/trip/TripTracking';
import { Avatar, AvatarFallback, Badge, Button, Card, StatusBanner } from '@/components/ui';
import { ErrorState, LoadingSkeleton } from '@/components/feedback';
import { formatINR, formatKm, formatPickupTime, initials } from '@/lib/utils';
import type { Trip, TripStatus } from '@/types';

const STATUS_LABEL: Partial<Record<TripStatus, { label: string; variant: 'success' | 'info' | 'muted' | 'destructive' }>> = {
  accepted: { label: 'Confirmed', variant: 'success' },
  in_progress: { label: 'In progress', variant: 'info' },
  completed: { label: 'Completed', variant: 'muted' },
  cancelled: { label: 'Cancelled', variant: 'destructive' },
};
const telHref = (phone?: string) => (phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : undefined);
const smsHref = (phone?: string) => (phone ? `sms:${phone.replace(/[^\d+]/g, '')}` : undefined);

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-secondary [&_svg]:size-4" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-secondary">{label}</div>
        <div className="truncate text-sm font-semibold">{value}</div>
      </div>
    </div>
  );
}

function ContactCard({ title, name, sub, phone, callLabel }: { title: string; name: string; sub?: string; phone?: string; callLabel: string }) {
  return (
    <Card className="gap-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">{title}</div>
      <div className="flex items-center gap-3">
        <Avatar className="size-12">
          <AvatarFallback>{initials(name || '?')}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{name || 'Unknown'}</div>
          {sub ? <div className="truncate text-xs text-secondary">{sub}</div> : null}
          {phone ? <div className="mt-0.5 font-mono text-xs text-secondary">{phone}</div> : null}
        </div>
      </div>
      {phone ? (
        <div className="flex gap-2">
          <Button asChild size="sm" className="flex-1">
            <a href={telHref(phone)} aria-label={callLabel}>
              <Phone className="size-4" aria-hidden /> Call
            </a>
          </Button>
          <Button asChild size="sm" variant="outline" className="flex-1">
            <a href={smsHref(phone)} aria-label={`Message ${name}`}>
              <MessageCircle className="size-4" aria-hidden /> Message
            </a>
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function TripView({ trip, otp }: { trip: Trip; otp: string }) {
  const driver = trip.assignedDriver;
  const status = STATUS_LABEL[trip.status] ?? { label: 'Confirmed', variant: 'success' as const };
  const firstName = trip.passengerName.trim().split(/\s+/)[0] || 'there';

  return (
    <div className="space-y-4 p-4">
      <Card className="gap-2">
        <div className="flex items-start justify-between gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Hello, {firstName}!</div>
          <Badge variant={status.variant} className="shrink-0">
            {status.label}
          </Badge>
        </div>
        <div className="text-lg font-bold leading-tight">
          {trip.fromCity.name} → {trip.toCity.name}
        </div>
        <div className="grid grid-cols-2 gap-3 pt-1">
          <Stat icon={<MapPin />} label="Distance" value={formatKm(trip.expectedDistanceKm)} />
          <Stat icon={<Calendar />} label="Pickup" value={formatPickupTime(trip.pickupAt)} />
          <Stat icon={<Car />} label="Vehicle" value={`${trip.carTypeLabel ?? 'Any car'}${trip.acRequired ? ' · AC' : ''}`} />
          <Stat icon={<KeyRound />} label="Your OTP" value={otp} />
        </div>
      </Card>

      <TripTracking trip={trip} />

      {driver ? (
        <Card className="gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Your driver</div>
          <div className="flex items-center gap-3">
            <Avatar className="size-14">
              <AvatarFallback className="text-base">{initials(driver.fullName || '?')}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="truncate font-bold">{driver.fullName || 'Driver'}</div>
              {driver.ratingCount > 0 ? (
                <div className="text-sm font-semibold text-amber-600">
                  ★ {driver.ratingAvg.toFixed(1)} <span className="font-normal text-secondary">· {driver.totalTripsCompleted} trips</span>
                </div>
              ) : (
                <div className="text-xs text-secondary">{driver.totalTripsCompleted} trips</div>
              )}
              <div className="mt-0.5 text-xs text-secondary">{trip.carTypeLabel ?? 'Car'}{trip.acRequired ? ' · AC' : ''}</div>
            </div>
          </div>
          {driver.phone ? (
            <div className="flex gap-2">
              <Button asChild size="sm" className="flex-1">
                <a href={telHref(driver.phone)} aria-label={`Call ${driver.fullName}`}>
                  <Phone className="size-4" aria-hidden /> Call driver
                </a>
              </Button>
              <Button asChild size="sm" variant="outline" className="flex-1">
                <a href={smsHref(driver.phone)} aria-label={`Message ${driver.fullName}`}>
                  <MessageCircle className="size-4" aria-hidden /> Message
                </a>
              </Button>
            </div>
          ) : null}
          <p className="text-[11px] italic text-secondary">Share your OTP with the driver only when they arrive — it confirms you&apos;re the right passenger.</p>
        </Card>
      ) : (
        <StatusBanner tone="warning">
          A driver hasn&apos;t been assigned to this trip yet. Their details will show up here as soon as the trip manager picks one.
        </StatusBanner>
      )}

      <ContactCard title="Trip manager" name={trip.postedByName ?? trip.postedByHandle} sub={trip.postedByRole === 'driver' ? 'A driver who passed on this trip' : 'Trip Manager'} phone={trip.postedByPhone} callLabel={`Call ${trip.postedByName ?? trip.postedByHandle}`} />

      <Card className={trip.showFareToPassenger ? 'gap-2' : 'gap-2 border-gray-200 bg-gray-50'}>
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-secondary">
          <Wallet className="size-3.5" aria-hidden /> Trip fare
        </div>
        {trip.showFareToPassenger ? (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-secondary">Fare ({formatKm(trip.expectedDistanceKm)} × {formatINR(trip.ratePerKm)}/km)</span>
              <span className="font-semibold">{formatINR(trip.totalFare)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-secondary">+ Driver bata</span>
              <span className="font-semibold">+ {formatINR(trip.driverBata)}</span>
            </div>
            <div className="mt-1 flex items-center justify-between border-t pt-2">
              <span className="font-bold">Total to the driver</span>
              <span className="text-2xl font-bold text-emerald-700">{formatINR(trip.totalFare + trip.driverBata)}</span>
            </div>
            <p className="text-xs text-secondary">🧳 Packing / toll / permit: {trip.extrasPaidByPassenger ? 'extra, paid by you' : 'included'}.</p>
            <p className="border-t pt-1 text-[11px] italic text-secondary">Pay this directly to the driver at the end of the trip — cash or UPI.</p>
          </>
        ) : (
          <>
            <div className="text-sm font-semibold">Fare handled separately</div>
            <p className="text-xs text-secondary">Your trip manager has chosen to handle payment directly — you don&apos;t need to pay the driver.</p>
          </>
        )}
      </Card>

      <p className="pt-1 text-center text-[11px] italic text-secondary">Need help? Call your trip manager — they&apos;re your support contact.</p>
    </div>
  );
}

function OtpGate({ onSubmit }: { onSubmit: (otp: string) => void }) {
  const [otp, setOtp] = useState('');
  return (
    <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center space-y-6 px-6 py-10">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
        <KeyRound className="size-8" aria-hidden />
      </div>
      <div className="space-y-1 text-center">
        <h2 className="text-xl font-bold">Enter your trip OTP</h2>
        <p className="text-sm text-secondary">Your trip manager shared a code with you over SMS or WhatsApp. Type it in to see your trip.</p>
      </div>
      <form
        className="w-full space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (otp.length >= 4) onSubmit(otp);
        }}
      >
        <input
          type="text"
          inputMode="numeric"
          maxLength={8}
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 8))}
          placeholder="••••••"
          aria-label="Trip OTP"
          autoFocus
          className="h-16 w-full rounded-xl border border-input bg-white text-center font-mono text-3xl font-bold tracking-[0.4em] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        />
        <Button type="submit" variant="full" size="lg" disabled={otp.length < 4}>
          View my trip
        </Button>
      </form>
      <div className="space-y-1 text-center text-xs text-secondary">
        <div className="flex items-center justify-center gap-1.5">
          <ShieldCheck className="size-3.5" aria-hidden /> Each OTP shows only one trip
        </div>
        <div>Lost your OTP? Ask the trip manager to share it again.</div>
      </div>
    </div>
  );
}

/**
 * Public passenger portal — no login. Reached as `/passenger` (type your OTP)
 * or `/passenger/:otp` (direct link from the trip manager). Looks the trip up
 * via `GET /trips/by-otp/:otp`, then shows the route, the assigned driver
 * (with Call / Message), the trip manager, and the fare (gated on the manager's
 * `show_fare_to_passenger` preference). Mirrors the prototype's passenger page.
 */
export function PassengerPage() {
  const { otp } = useParams<{ otp?: string }>();
  const navigate = useNavigate();
  const tripQuery = useTripByOtp(otp);

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-gray-50">
      <header className="sticky top-0 z-10 flex items-center gap-3 bg-surface px-4 py-3 shadow-header">
        <button type="button" aria-label="Back" onClick={() => (otp ? navigate('/passenger', { replace: true }) : navigate('/'))} className="-ml-1 flex size-8 items-center justify-center rounded-full text-secondary hover:bg-muted">
          <ArrowLeft className="size-5" aria-hidden />
        </button>
        <div className="text-base font-semibold">{otp ? 'Your trip' : 'Passenger portal'}</div>
      </header>

      <main className="flex-1">
        {!otp ? (
          <OtpGate onSubmit={(value) => navigate(`/passenger/${encodeURIComponent(value)}`)} />
        ) : tripQuery.isError ? (
          <div className="space-y-3 p-4">
            <ErrorState title="OTP not recognised" message="Double-check the code with your trip manager, or ask them to share the link again." />
            <Button variant="outline" size="sm" className="w-full" onClick={() => navigate('/passenger', { replace: true })}>
              Try another OTP
            </Button>
          </div>
        ) : tripQuery.isPending ? (
          <div className="p-4">
            <LoadingSkeleton rows={6} />
          </div>
        ) : (
          <TripView trip={tripQuery.data} otp={otp} />
        )}
      </main>
    </div>
  );
}

export default PassengerPage;
