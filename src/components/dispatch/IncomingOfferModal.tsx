import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui';
import { useAcceptTrip, useDeclineTrip, useIncomingOffer } from '@/hooks/useTrips';
import { useDispatchAlgorithm } from '@/hooks/usePlatformConfig';
import { formatINR, formatPickupDateTime } from '@/lib/utils';
import type { MyApplication } from '@/types';

const RING_MAX = 60; // visual max for the countdown ring (the default offer window)

/**
 * Auto-dispatch incoming-offer popup for the driver. Renders only when the platform
 * is in Auto AND the driver is the live offer (a 'selected' application with a future
 * acceptance deadline). Shows a 60s countdown ring + Accept / Decline (reusing the
 * proven /accept and /decline handshake). Auto-dismisses when the deadline lapses (the
 * engine has already advanced to the next driver).
 */
export function IncomingOfferGate() {
  const algorithm = useDispatchAlgorithm();
  if (algorithm !== 'auto') return null; // no query/poll outside Auto
  return <IncomingOfferWatcher />;
}

function IncomingOfferWatcher() {
  const offer = useIncomingOffer();
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (!offer || dismissed === offer.acceptanceId) return null;
  return <IncomingOfferModal offer={offer} onClose={() => setDismissed(offer.acceptanceId)} />;
}

export function IncomingOfferModal({ offer, onClose }: { offer: MyApplication; onClose: () => void }) {
  const trip = offer.trip;
  const accept = useAcceptTrip();
  const decline = useDeclineTrip();
  const deadline = trip.acceptanceDeadlineAt ? Date.parse(trip.acceptanceDeadlineAt) : 0;

  const [secs, setSecs] = useState(() => Math.max(0, Math.round((deadline - Date.now()) / 1000)));
  useEffect(() => {
    const id = window.setInterval(() => setSecs(Math.max(0, Math.round((deadline - Date.now()) / 1000))), 500);
    return () => window.clearInterval(id);
  }, [deadline]);
  // The engine advances on expiry; close the stale popup.
  useEffect(() => { if (secs <= 0) onClose(); }, [secs, onClose]);

  const pending = accept.isPending || decline.isPending;
  function onAccept() {
    accept.mutate({ tripId: trip.id }, {
      onSuccess: () => { toast.success('Trip accepted — it’s yours!'); onClose(); },
      onError: () => toast.error('Couldn’t accept — the offer may have moved on.'),
    });
  }
  function onDecline() {
    decline.mutate({ tripId: trip.id }, {
      onSuccess: () => { toast('Passed to the next driver.'); onClose(); },
      onError: () => toast.error('Couldn’t decline — please try again.'),
    });
  }

  const r = 36;
  const circ = 2 * Math.PI * r;
  const pct = Math.min(1, secs / RING_MAX);
  const danger = secs <= 10;

  return (
    <div role="dialog" aria-modal="true" aria-label="Incoming trip offer" className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-2xl bg-white sm:rounded-2xl">
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <svg width="64" height="64" viewBox="0 0 88 88" role="img" aria-label={`${secs} seconds to accept`}>
            <circle cx="44" cy="44" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
            <circle cx="44" cy="44" r={r} fill="none" stroke={danger ? '#e11d48' : '#059669'} strokeWidth="8" strokeLinecap="round"
              strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} transform="rotate(-90 44 44)" style={{ transition: 'stroke-dashoffset 0.5s linear' }} />
            <text x="44" y="44" textAnchor="middle" dominantBaseline="central" fontSize="24" fontWeight="800" className="fill-slate-900">{secs}</text>
          </svg>
          <div className="min-w-0">
            <div className="text-sm font-bold text-emerald-700">New trip offer</div>
            <div className="text-xs text-secondary">Accept before the timer runs out.</div>
          </div>
        </div>
        <div className="space-y-1.5 px-4 py-3 text-sm">
          <div className="text-base font-bold text-foreground">{trip.fromCity?.name} → {trip.toCity?.name}</div>
          <div className="text-secondary">Pickup {formatPickupDateTime(trip.pickupAt)}</div>
          {typeof trip.totalFare === 'number' ? <div className="text-secondary">Fare {formatINR(trip.totalFare)}{trip.ratePerKm ? ` · ₹${trip.ratePerKm}/km` : ''}</div> : null}
        </div>
        <div className="flex items-center gap-2 border-t px-4 py-3">
          <Button variant="outline" className="flex-1" onClick={onDecline} disabled={pending}>Decline</Button>
          <Button className="flex-1" onClick={onAccept} disabled={pending}>{accept.isPending ? 'Accepting…' : 'Accept'}</Button>
        </div>
      </div>
    </div>
  );
}

export default IncomingOfferModal;
