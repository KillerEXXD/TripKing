/* eslint-disable react/forbid-dom-props -- This component is the source node
 * for html-to-image snapshot generation. We use inline styles deliberately:
 * (1) html-to-image extracts computed styles when serialising the node to PNG,
 *     and inline styles are the most reliable input — Tailwind's @apply +
 *     class resolution can occasionally drop properties under certain build
 *     configurations.
 * (2) The card needs precise pixel font sizes that don't map to default
 *     Tailwind utility classes, and the output PNG must look identical
 *     regardless of the consumer's tailwind theme overrides. */
import { forwardRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import type { Trip } from '@/types';
import { formatINR, formatKm } from '@/lib/utils';
import { buildShareUrl, resolvePosterPhone } from '@/lib/share/tripShare';
import { tripDriverBata, tripExtrasPaidByPassenger } from '@/lib/tripDefaults';

interface Props {
  trip: Trip;
  /** Override the deep-link URL — used by the modal to inject the live host. */
  url?: string;
}

const FONT =
  "'Inter', 'Noto Sans Tamil', 'Noto Sans Devanagari', system-ui, -apple-system, BlinkMacSystemFont, sans-serif";

/**
 * Marketing card for a posted trip.
 *
 * 1080×1200 (9:10) — chat-friendly aspect that renders close to full-width
 * in WhatsApp/Telegram thumbnails without long-tail crop. Slightly taller
 * than 1:1 to fit the payout breakdown comfortably.
 *
 * Hierarchy (top → bottom):
 *  1. Compact emerald header band with brand + "NEW TRIP" + optional
 *     "DEPARTING SOON" urgency badge.
 *  2. Route hero (Vellore → Chennai) with state subtitle and "Posted by X"
 *     trust line.
 *  3. Big pickup pill — date + time, intentionally large.
 *  4. Distance + estimated duration row.
 *  5. **Payout breakdown card** — line items so the driver knows exactly
 *     what they take home (per user request).
 *  6. Vehicle requirement chips.
 *  7. QR + URL row — no big "Apply now" CTA inside the image; the QR + URL
 *     speaks for itself.
 *  8. Tiny trip-ID footer for support reference.
 *
 * Same component used for both the visible preview and the offscreen
 * snapshot source (passed by ref to html-to-image).
 */
export const TripShareCard = forwardRef<HTMLDivElement, Props>(function TripShareCard(
  { trip, url: urlOverride },
  ref,
) {
  const url = urlOverride ?? buildShareUrl(trip);
  const navigate = useNavigate();
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  // When the URL inside the live preview is clicked, do an in-app SPA
  // navigation (no full reload) so the manager lands on the trip detail
  // page directly. Same-origin only — falls back to a normal anchor follow
  // for off-origin URLs (won't happen in practice).
  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (typeof window === 'undefined') return;
    try {
      const u = new URL(url);
      if (u.origin === window.location.origin) {
        e.preventDefault();
        navigate(u.pathname + u.search + u.hash);
      }
    } catch {
      /* let the anchor handle it */
    }
  };

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 220,
      color: { dark: '#0a0a0a', light: '#ffffff' },
    })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [url]);

  const extrasByPassenger = tripExtrasPaidByPassenger(trip);
  const contact = resolvePosterPhone(trip);
  const pickup = new Date(trip.pickupDateTime);
  const pickupDate = pickup.toLocaleString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  });
  const pickupTime = pickup.toLocaleString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
  });

  // Payout math (mirror what the form computed; recompute here for
  // robustness against partial Trip objects from URL-hash decode).
  const totalFare = trip.totalFare;
  const commissionAmount = Math.round((totalFare * trip.commissionPct) / 100);
  const gstAmount = trip.gstAmount;
  const driverBata = tripDriverBata(trip);
  const driverPayout = Math.max(0, totalFare - commissionAmount - gstAmount) + driverBata;

  // Estimated road-driving time at ~50 km/h (urban-mix average for India).
  const estimatedHours = trip.expectedDistanceKm / 50;
  const estimatedDuration =
    estimatedHours < 1
      ? `~ ${Math.round(estimatedHours * 60)} min`
      : `~ ${estimatedHours.toFixed(estimatedHours < 10 ? 1 : 0)} hrs`;

  // Urgency: pickup within 6 hours of now.
  const hoursToPickup = (pickup.getTime() - Date.now()) / 3600_000;
  const isUrgent = hoursToPickup > 0 && hoursToPickup <= 6;

  return (
    <div
      ref={ref}
      style={{
        width: '1080px',
        height: '1200px',
        fontFamily: FONT,
      }}
      className="bg-white text-gray-900 flex flex-col"
    >
      {/* HEADER */}
      <div
        style={{
          background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
        }}
        className="px-12 py-5 text-white flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div style={{ fontSize: '36px' }}>👑</div>
          <div>
            <div
              className="font-extrabold tracking-tight leading-none"
              style={{ fontSize: '28px' }}
            >
              Trip King
            </div>
            <div className="text-white/85" style={{ fontSize: '13px' }}>
              Inter-city cab marketplace
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div
            className="font-bold uppercase tracking-[0.2em] text-white/95"
            style={{ fontSize: '12px' }}
          >
            New trip
          </div>
          {isUrgent && (
            <div
              style={{
                background: '#fef3c7',
                color: '#92400e',
                fontSize: '12px',
                padding: '3px 10px',
                borderRadius: '999px',
                fontWeight: 800,
                letterSpacing: '0.06em',
              }}
            >
              ⚡ DEPARTING SOON
            </div>
          )}
        </div>
      </div>

      {/* ROUTE HERO */}
      <div className="px-12 pt-9 pb-3">
        <div
          className="font-extrabold leading-[1.05]"
          style={{ fontSize: '78px', letterSpacing: '-0.025em' }}
        >
          {trip.fromCity.name}
          <span style={{ color: '#10b981' }}> → </span>
          {trip.toCity.name}
        </div>
        {(trip.fromCity.state || trip.toCity.state) && (
          <div
            className="text-gray-500 mt-1.5"
            style={{ fontSize: '20px' }}
          >
            {trip.fromCity.state}
            {trip.toCity.state && trip.toCity.state !== trip.fromCity.state
              ? ` → ${trip.toCity.state}`
              : ''}
          </div>
        )}
        {trip.postedByName && (
          <div
            className="text-gray-600 mt-2.5"
            style={{ fontSize: '17px' }}
          >
            Posted by{' '}
            <span className="text-gray-900" style={{ fontWeight: 700 }}>
              {trip.postedByName}
            </span>
          </div>
        )}
      </div>

      {/* PICKUP — bigger per user request */}
      <div className="px-12 pt-2 pb-5">
        <div
          className="inline-flex items-center gap-3 rounded-2xl px-6 py-3"
          style={{
            backgroundColor: '#ecfdf5',
            color: '#065f46',
            border: '2px solid #a7f3d0',
            fontSize: '30px',
            fontWeight: 800,
            letterSpacing: '-0.01em',
          }}
        >
          <span style={{ fontSize: '28px' }}>📅</span>
          <span>{pickupDate}</span>
          <span style={{ color: '#10b981' }}>·</span>
          <span>{pickupTime}</span>
        </div>
      </div>

      {/* DISTANCE + DURATION */}
      <div className="px-12 pb-5 grid grid-cols-2 gap-3">
        <StatTile label="Distance" value={formatKm(trip.expectedDistanceKm)} />
        <StatTile label="Approx. duration" value={estimatedDuration} />
      </div>

      {/* PAYOUT BREAKDOWN — line items per user request */}
      <div className="px-12 pb-5">
        <div
          className="rounded-2xl px-7 py-5"
          style={{
            background: '#fafafa',
            border: '2px solid #e5e7eb',
          }}
        >
          <BreakdownRow
            label={`Trip cost (${formatKm(trip.expectedDistanceKm)} × ${formatINR(trip.ratePerKm)}/km)`}
            value={formatINR(totalFare)}
          />
          <BreakdownRow
            label={`− Commission (${trip.commissionPct}%)`}
            value={`− ${formatINR(commissionAmount)}`}
            muted
          />
          <BreakdownRow
            label="− GST"
            value={`− ${formatINR(gstAmount)}`}
            muted
          />
          <BreakdownRow label="+ Driver bata" value={`+ ${formatINR(driverBata)}`} />
          <BreakdownRow
            label="🧳 Packing, toll & permit"
            value={extrasByPassenger ? 'Extra — by passenger' : 'Included'}
            muted
          />
          <div
            style={{
              borderTop: '2px solid #e5e7eb',
              marginTop: '14px',
              paddingTop: '14px',
            }}
            className="flex items-center justify-between"
          >
            <div>
              <div
                className="font-bold uppercase tracking-[0.18em]"
                style={{ color: '#047857', fontSize: '13px' }}
              >
                ≈ Approx. cost
              </div>
              <div
                className="text-emerald-800/70 mt-0.5"
                style={{ fontSize: '13px' }}
              >
                driver's take-home (incl. bata)
              </div>
            </div>
            <div
              className="font-extrabold leading-none"
              style={{ fontSize: '64px', color: '#064e3b' }}
            >
              {formatINR(driverPayout)}
            </div>
          </div>
        </div>
      </div>

      {/* VEHICLE CHIPS */}
      <div className="px-12 pb-5">
        <div className="flex flex-wrap gap-2.5">
          <Chip label={`🚗 ${trip.carTypeRequired}`} />
          {trip.acRequired && <Chip label="❄️ AC" tone="blue" />}
          <Chip label={`👥 ${trip.seatsRequired} seats`} />
          <Chip label={`💵 ${formatINR(trip.ratePerKm)}/km`} tone="green" />
        </div>
      </div>

      {/* QR + URL — pinned to bottom; no "Apply now" inside the image */}
      <div className="mt-auto px-12 pb-3 flex items-center gap-5">
        <div
          className="rounded-xl bg-white p-2 shrink-0"
          style={{ border: '2px solid #e5e7eb' }}
        >
          {qrDataUrl ? (
            // eslint-disable-next-line jsx-a11y/img-redundant-alt
            <img
              src={qrDataUrl}
              alt="Scan to view trip"
              width={170}
              height={170}
              style={{ display: 'block' }}
            />
          ) : (
            <div
              style={{ width: 170, height: 170, background: '#f3f4f6' }}
              className="rounded-lg"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          {contact && (
            <div
              className="text-gray-800"
              style={{ fontSize: '17px', fontWeight: 700 }}
            >
              📞 {contact}
            </div>
          )}
          <div
            className="font-bold uppercase tracking-[0.18em] text-gray-500 mt-1"
            style={{ fontSize: '12px' }}
          >
            Scan or tap the link to view & apply
          </div>
          {/* Anchor so the URL is clickable in the live preview (modal) —
              click navigates within the SPA to the trip detail page so the
              user can verify it works. In the rendered PNG it appears as
              styled text only (pixels can't carry hyperlinks). */}
          <a
            href={url}
            onClick={handleLinkClick}
            className="font-mono text-gray-700 break-all mt-1.5 block"
            style={{
              fontSize: '15px',
              lineHeight: 1.4,
              textDecoration: 'none',
              cursor: 'pointer',
            }}
          >
            {url.replace(/^https?:\/\//, '').replace(/#.*$/, '')}
          </a>
        </div>
      </div>

      {/* TINY TRIP-ID FOOTER */}
      <div
        className="px-12 pb-4 font-mono text-gray-400"
        style={{ fontSize: '11px', letterSpacing: '0.04em' }}
      >
        Trip ID: {trip.id}
      </div>
    </div>
  );
});

// =====================
// Sub-components
// =====================

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-2xl px-5 py-4"
      style={{ background: '#f9fafb', border: '2px solid #e5e7eb' }}
    >
      <div
        className="font-bold uppercase tracking-[0.18em] text-gray-500"
        style={{ fontSize: '12px' }}
      >
        {label}
      </div>
      <div
        className="font-extrabold leading-none mt-2 text-gray-900"
        style={{ fontSize: '46px' }}
      >
        {value}
      </div>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between"
      style={{ marginBottom: '10px' }}
    >
      <span
        style={{
          fontSize: '20px',
          color: muted ? '#6b7280' : '#1f2937',
          fontWeight: muted ? 500 : 600,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: '22px',
          color: muted ? '#6b7280' : '#1f2937',
          fontWeight: muted ? 500 : 700,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
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
    <div
      className="rounded-full px-4 py-1.5"
      style={{
        backgroundColor: c.bg,
        color: c.fg,
        border: `2px solid ${c.border}`,
        fontSize: '19px',
        fontWeight: 700,
      }}
    >
      {label}
    </div>
  );
}
