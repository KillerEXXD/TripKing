/* This component is the snapshot source for `html-to-image` — it uses inline
 * styles deliberately so the rendered PNG is identical regardless of the
 * consumer's Tailwind theme, and so html-to-image (which serialises computed
 * styles) gets the most reliable input. It carries no QR code and no printed
 * URL — the deep link travels in the text caption only. */
import { forwardRef } from 'react';
import { formatINR, formatKm } from '@/lib/utils';
import type { Trip } from '@/types';

const FONT = "'Inter', 'Noto Sans Tamil', 'Noto Sans Devanagari', system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

function pickupParts(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: iso, time: '' };
  return {
    date: d.toLocaleString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' }),
    time: d.toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit' }),
  };
}
function estDuration(km: number): string {
  const h = km / 50; // ~50 km/h urban-mix average
  return h < 1 ? `~ ${Math.round(h * 60)} min` : `~ ${h.toFixed(h < 10 ? 1 : 0)} hrs`;
}

/**
 * 1080×1200 marketing card for a posted trip — used both as the visible preview
 * and (via ref) as the html-to-image snapshot source. Top stats row carries
 * Distance · Approx. duration · 🚗 Car type required so it reads in a WhatsApp
 * thumbnail; the driver payout (server-computed) is the big figure.
 */
export const TripShareCard = forwardRef<HTMLDivElement, { trip: Trip }>(function TripShareCard({ trip }, ref) {
  const carType = trip.carTypeLabel ?? 'Any';
  const { date: pickupDate, time: pickupTime } = pickupParts(trip.pickupAt);
  const hoursToPickup = (new Date(trip.pickupAt).getTime() - Date.now()) / 3_600_000;
  const isUrgent = hoursToPickup > 0 && hoursToPickup <= 6;
  const contact = trip.postedByPhone ?? '';

  return (
    <div ref={ref} style={{ width: '1080px', height: '1200px', fontFamily: FONT }} className="flex flex-col bg-white text-gray-900">
      {/* HEADER */}
      <div style={{ background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)' }} className="flex items-center justify-between px-12 py-5 text-white">
        <div className="flex items-center gap-3">
          <div style={{ fontSize: '36px' }}>👑</div>
          <div>
            <div className="font-extrabold leading-none tracking-tight" style={{ fontSize: '28px' }}>
              TripKing
            </div>
            <div className="text-white/85" style={{ fontSize: '13px' }}>
              Inter-city cab marketplace
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="font-bold uppercase tracking-[0.2em] text-white/95" style={{ fontSize: '12px' }}>
            New trip
          </div>
          {isUrgent ? (
            <div style={{ background: '#fef3c7', color: '#92400e', fontSize: '12px', padding: '3px 10px', borderRadius: '999px', fontWeight: 800, letterSpacing: '0.06em' }}>
              ⚡ DEPARTING SOON
            </div>
          ) : null}
        </div>
      </div>

      {/* ROUTE HERO */}
      <div className="px-12 pb-3 pt-9">
        <div className="font-extrabold leading-[1.05]" style={{ fontSize: '78px', letterSpacing: '-0.025em' }}>
          {trip.fromCity.name}
          <span style={{ color: '#10b981' }}> → </span>
          {trip.toCity.name}
        </div>
        {trip.fromCity.state || trip.toCity.state ? (
          <div className="mt-1.5 text-gray-500" style={{ fontSize: '20px' }}>
            {trip.fromCity.state}
            {trip.toCity.state && trip.toCity.state !== trip.fromCity.state ? ` → ${trip.toCity.state}` : ''}
          </div>
        ) : null}
        {trip.postedByName ? (
          <div className="mt-2.5 text-gray-600" style={{ fontSize: '17px' }}>
            Posted by{' '}
            <span className="text-gray-900" style={{ fontWeight: 700 }}>
              {trip.postedByName}
            </span>
          </div>
        ) : null}
      </div>

      {/* PICKUP */}
      <div className="px-12 pb-5 pt-2">
        <div
          className="inline-flex items-center gap-3 rounded-2xl px-6 py-3"
          style={{ backgroundColor: '#ecfdf5', color: '#065f46', border: '2px solid #a7f3d0', fontSize: '30px', fontWeight: 800, letterSpacing: '-0.01em' }}
        >
          <span style={{ fontSize: '28px' }}>📅</span>
          <span>{pickupDate}</span>
          <span style={{ color: '#10b981' }}>·</span>
          <span>{pickupTime}</span>
        </div>
      </div>

      {/* DISTANCE · DURATION · CAR TYPE */}
      <div className="grid grid-cols-3 gap-3 px-12 pb-5">
        <StatTile label="Distance" value={formatKm(trip.expectedDistanceKm)} />
        <StatTile label="Approx. duration" value={estDuration(trip.expectedDistanceKm)} />
        <StatTile label="🚗 Car type required" value={carType} />
      </div>

      {/* PAYOUT BREAKDOWN — driver payout is the server-computed value */}
      <div className="px-12 pb-4">
        <div className="rounded-2xl px-7 py-5" style={{ background: '#fafafa', border: '2px solid #e5e7eb' }}>
          <BreakdownRow label={`Trip cost (${formatKm(trip.expectedDistanceKm)} × ${formatINR(trip.ratePerKm)}/km)`} value={formatINR(trip.totalFare)} />
          <BreakdownRow label={`− Commission (${trip.commissionPct}%)`} value="—" muted />
          <BreakdownRow label="− GST" value={`− ${formatINR(trip.gstAmount)}`} muted />
          <BreakdownRow label="+ Driver bata" value={`+ ${formatINR(trip.driverBata)}`} />
          <BreakdownRow label="🧳 Packing, toll & permit" value={trip.extrasPaidByPassenger ? 'Extra — by passenger' : 'Included'} muted />
          <div style={{ borderTop: '2px solid #e5e7eb', marginTop: '14px', paddingTop: '14px' }} className="flex items-center justify-between">
            <div>
              <div className="font-bold uppercase tracking-[0.16em]" style={{ color: '#047857', fontSize: '18px' }}>
                Driver payout
              </div>
              <div className="mt-0.5 text-emerald-800/80" style={{ fontSize: '16px' }}>
                take-home (incl. bata)
              </div>
            </div>
            <div className="font-extrabold leading-none" style={{ fontSize: '64px', color: '#064e3b' }}>
              {formatINR(trip.driverPayout)}
            </div>
          </div>
        </div>
      </div>

      {/* VEHICLE CHIPS */}
      <div className="px-12 pb-3">
        <div className="flex flex-wrap gap-2.5">
          <Chip label={`🚗 ${carType}`} />
          {trip.acRequired ? <Chip label="❄️ AC" tone="blue" /> : null}
          <Chip label={`👥 ${trip.seatsRequired} seats`} />
          <Chip label={`💵 ${formatINR(trip.ratePerKm)}/km`} tone="green" />
        </div>
      </div>

      {/* CONTACT — pinned to the bottom; no QR, no printed URL */}
      <div className="mt-auto px-12 pb-6">
        {contact ? (
          <div className="text-gray-800" style={{ fontSize: '20px', fontWeight: 700 }}>
            📞 {contact}
          </div>
        ) : null}
        <div className="mt-1 font-bold uppercase tracking-[0.18em] text-gray-500" style={{ fontSize: '13px' }}>
          View &amp; apply on TripKing
        </div>
      </div>

      <div className="px-12 pb-4 font-mono text-gray-400" style={{ fontSize: '11px', letterSpacing: '0.04em' }}>
        Trip ID: {trip.id}
      </div>
    </div>
  );
});

export default TripShareCard;

// ── sub-components ──────────────────────────────────────────────────────────
function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl px-5 py-4" style={{ background: '#f9fafb', border: '2px solid #e5e7eb' }}>
      <div className="font-bold uppercase tracking-[0.18em] text-gray-500" style={{ fontSize: '12px' }}>
        {label}
      </div>
      <div className="mt-2 font-extrabold leading-none text-gray-900" style={{ fontSize: '40px' }}>
        {value}
      </div>
    </div>
  );
}
function BreakdownRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between" style={{ marginBottom: '13px' }}>
      <span style={{ fontSize: '27px', color: muted ? '#4b5563' : '#111827', fontWeight: muted ? 600 : 700 }}>{label}</span>
      <span style={{ fontSize: '30px', color: muted ? '#4b5563' : '#111827', fontWeight: muted ? 700 : 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  );
}
type ChipTone = 'slate' | 'blue' | 'green';
function Chip({ label, tone = 'slate' }: { label: string; tone?: ChipTone }) {
  const palette: Record<ChipTone, { bg: string; fg: string; border: string }> = {
    slate: { bg: '#f3f4f6', fg: '#1f2937', border: '#d1d5db' },
    blue: { bg: '#dbeafe', fg: '#1e40af', border: '#93c5fd' },
    green: { bg: '#ecfdf5', fg: '#047857', border: '#a7f3d0' },
  };
  const c = palette[tone];
  return (
    <div className="rounded-full px-4 py-1.5" style={{ backgroundColor: c.bg, color: c.fg, border: `2px solid ${c.border}`, fontSize: '19px', fontWeight: 700 }}>
      {label}
    </div>
  );
}
