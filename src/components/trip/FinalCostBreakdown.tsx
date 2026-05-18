/**
 * Post-completion cost breakdown — rendered on the trip detail page when the trip's
 * status is `completed`. Role-aware: drivers and the trip-posting agent see the full
 * breakdown (base, extra-KM, toll, GST, commission, bata, final payout); admins
 * additionally get the original-vs-revised payout deltas.
 *
 * Values come straight from the server (migration 059's compute_trip_final_payout
 * trigger). If the trip predates the trigger (no `finalDriverPayout` yet), this
 * falls back to the baseline `driverPayout` and skips the extra-KM/toll lines.
 */
import { Card } from '@/components/ui';
import { formatINR, formatKm } from '@/lib/utils';
import type { Trip } from '@/types';

export type FinalCostBreakdownAudience = 'driver' | 'agent' | 'admin';

export interface FinalCostBreakdownProps {
  trip: Trip;
  /** What this viewer is allowed to see. Passenger summary lives on PassengerPage. */
  audience: FinalCostBreakdownAudience;
}

function Row({ label, value, muted, strong, accent }: { label: string; value: string; muted?: boolean; strong?: boolean; accent?: 'extra' | 'toll' | 'positive' | 'negative' }) {
  const tone = strong
    ? 'text-lg text-emerald-700'
    : accent === 'extra' ? 'font-medium text-amber-700'
    : accent === 'toll' ? 'font-medium text-sky-700'
    : accent === 'positive' ? 'font-medium text-emerald-700'
    : accent === 'negative' ? 'font-medium text-rose-700'
    : muted ? 'text-secondary' : 'font-medium';
  return (
    <div className={`flex items-center justify-between text-sm ${strong ? 'border-t pt-2 font-bold' : ''}`}>
      <span className={muted ? 'text-secondary' : undefined}>{label}</span>
      <span className={tone}>{value}</span>
    </div>
  );
}

export function FinalCostBreakdown({ trip, audience }: FinalCostBreakdownProps) {
  if (trip.status !== 'completed') return null;
  const finalPayout = trip.finalDriverPayout ?? trip.driverPayout;
  const finalFare = trip.finalTotalFare ?? trip.totalFare;
  const extraKm = trip.extraDistanceKm ?? 0;
  const extraFare = trip.extraKmFare ?? 0;
  const toll = trip.tollAmount ?? 0;
  const commission = Math.round((trip.totalFare + extraFare) * trip.commissionPct) / 100;

  return (
    <Card className="space-y-1.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-secondary">Final cost</div>

      <Row label="Base fare" value={formatINR(trip.totalFare)} muted />
      {extraKm > 0 ? (
        <Row label={`Extra ${formatKm(extraKm)} @ ${formatINR(trip.ratePerKm)}/km`} value={`+ ${formatINR(extraFare)}`} accent="extra" />
      ) : null}
      {toll > 0 ? (
        <Row label="Toll (paid by driver, passed through)" value={`+ ${formatINR(toll)}`} accent="toll" />
      ) : null}
      <Row label="Passenger bill total" value={formatINR(finalFare)} strong={audience !== 'driver'} />

      {audience !== 'driver' ? null : <div className="h-1" />}

      {audience !== 'driver' ? <div className="h-1" /> : null}
      <Row label={`Platform commission (${trip.commissionPct}%)`} value={`− ${formatINR(commission)}`} accent="negative" muted />
      <Row label="GST" value={`− ${formatINR(trip.gstAmount)}`} accent="negative" muted />
      <Row label="Driver bata" value={`+ ${formatINR(trip.driverBata)}`} accent="positive" muted />
      {toll > 0 ? <Row label="Toll reimbursement" value={`+ ${formatINR(toll)}`} accent="toll" muted /> : null}

      <Row label={audience === 'driver' ? 'Your payout' : "Driver's payout"} value={formatINR(finalPayout)} strong />

      {audience === 'admin' && trip.finalDriverPayout != null && trip.driverPayout !== trip.finalDriverPayout ? (
        <div className="mt-1 text-xs text-secondary">
          Original baseline payout: {formatINR(trip.driverPayout)} · Δ {formatINR(trip.finalDriverPayout - trip.driverPayout)}
        </div>
      ) : null}
    </Card>
  );
}

export default FinalCostBreakdown;
