/**
 * Trip-sharing helpers — build the WhatsApp/Telegram caption + deep link, snapshot
 * the share card to a PNG, and hand it to `navigator.share` (with graceful fallbacks).
 * The image itself carries the details; per product, it has no QR code and no URL printed
 * on it — the link lives only in the text caption.
 */
import { toBlob } from 'html-to-image';
import { formatINR, formatKm } from '@/lib/utils';
import type { Trip, Waypoint } from '@/types';

// ── Trip-type share variants (migration 024) ─────────────────────────────────
/**
 * Four shareable variants. `Trip.tripType` is the route *shape*; the variant collapses
 * `multi_way` into "drop" vs "return back" based on whether the last waypoint loops back
 * to the first. Drives the 🧭 line in the WhatsApp/Telegram caption.
 */
export type ShareVariant = 'one_way_drop' | 'round_trip_return' | 'multi_way_drop' | 'multi_way_return';

export function shareVariant(trip: Trip): ShareVariant {
  if (!trip.tripType || trip.tripType === 'one_way') return 'one_way_drop';
  if (trip.tripType === 'round_trip') return 'round_trip_return';
  // multi_way: derive drop-vs-return from the waypoints chain.
  const wp = trip.waypoints ?? [];
  if (wp.length < 2) return 'multi_way_drop';
  const firstId = wp[0]?.place?.id ?? wp[0]?.city?.id;
  const lastId = wp[wp.length - 1]?.place?.id ?? wp[wp.length - 1]?.city?.id;
  return firstId && lastId && firstId === lastId ? 'multi_way_return' : 'multi_way_drop';
}

export const VARIANT_LABEL: Record<ShareVariant, string> = {
  one_way_drop: 'One-way drop',
  round_trip_return: 'Round-trip return back',
  multi_way_drop: 'Multi-way drop',
  multi_way_return: 'Multi-way return back',
};

/** Public deep link to the trip's detail page. */
export function buildShareUrl(trip: Trip): string {
  const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'https://trip-king.vercel.app';
  return `${origin}/trips/${trip.id}`;
}

/** The poster's contact number, if they shared one. */
export function resolvePosterPhone(trip: Trip): string {
  return trip.postedByPhone ?? '';
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}
function pickupDateLong(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toLocaleDateString('en-IN', { weekday: 'long' })}, ${ordinal(d.getDate())} ${d.toLocaleDateString('en-IN', { month: 'long' })} ${d.getFullYear()}`;
}
function pickupTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}
function placeLabel(c: { name: string; state?: string }): string {
  return c.state ? `${c.name}, ${c.state}` : c.name;
}

function waypointLabel(w: Waypoint): string {
  return w.place?.name ?? (w.city ? placeLabel(w.city) : '—');
}
function waypointTail(w: Waypoint): string {
  const time = w.arriveAt ? `${pickupDateLong(w.arriveAt)}, ${pickupTime(w.arriveAt)}` : null;
  const wait = w.waitMinutes > 0 ? `${w.waitMinutes >= 60 ? `${Math.round(w.waitMinutes / 60)}h` : `${w.waitMinutes}m`} wait` : null;
  const parts = [time, wait].filter(Boolean);
  return parts.length > 0 ? ` (${parts.join(' · ')})` : '';
}
/** Render a multi-stop route as `📍 origin → stop → … → final`, one line per waypoint after the origin. */
function routeChainBlock(trip: Trip): string[] {
  const wp = trip.waypoints ?? [];
  if (wp.length < 2) return [];
  const lines = [`📍 ${waypointLabel(wp[0]!)}`];
  for (let i = 1; i < wp.length; i++) {
    lines.push(`   → ${waypointLabel(wp[i]!)}${waypointTail(wp[i]!)}`);
  }
  return lines;
}

/**
 * Plain-text caption for WhatsApp / Telegram (also the clipboard fallback).
 * Three icon-led blocks — trip / money / poster — then the deep link.
 */
export function buildShareCaption(trip: Trip, opts: { withUrl?: boolean } = { withUrl: true }): string {
  const acTag = trip.acRequired ? ' · AC' : '';
  const carType = trip.carTypeLabel ?? 'Any';
  const contact = resolvePosterPhone(trip);
  const variant = shareVariant(trip);
  const hasChain = (trip.waypoints ?? []).length >= 3;

  // Route block — a chain when there are intermediate waypoints, otherwise the existing
  // 2-row "Pickup / Drop" pair. Either way, the 🧭 line names the variant up front.
  const routeBlock = hasChain
    ? [`🧭 ${VARIANT_LABEL[variant]}`, ...routeChainBlock(trip)]
    : [
        `🧭 ${VARIANT_LABEL[variant]}`,
        `📍 Pickup: ${placeLabel(trip.fromCity)}`,
        `🏁 Drop: ${placeLabel(trip.toCity)}`,
      ];

  const scheduleBlock = [
    `🛣️ Distance: ${formatKm(trip.expectedDistanceKm)}`,
    `📅 Trip starts: ${pickupDateLong(trip.pickupAt)}, ${pickupTime(trip.pickupAt)}`,
    ...(trip.expectedEndAt && trip.expectedEndAt !== trip.pickupAt
      ? [`🕒 Trip ends: ${pickupDateLong(trip.expectedEndAt)}, ${pickupTime(trip.expectedEndAt)}`]
      : []),
  ];

  const tripBlock = [
    `🚗 Car type required: ${carType}${acTag}`,
    ...routeBlock,
    ...scheduleBlock,
  ];
  const moneyBlock = [
    `💵 Per km: ${formatINR(trip.ratePerKm)}`,
    `🧾 Commission: ${trip.commissionPct}% + GST ${formatINR(trip.gstAmount)}`,
    `🤝 Bata: ${formatINR(trip.driverBata)}`,
    `🧳 Packing, toll & permit: ${trip.extrasPaidByPassenger ? 'Extra — paid by passenger' : 'Included in fare'}`,
    `≈ Driver payout: ${formatINR(trip.driverPayout)}`,
  ];
  const posterBlock = contact ? [`📞 Contact: ${contact}`] : [];

  const lines = ['👑 New trip on TripKing', '', ...tripBlock, '', ...moneyBlock];
  if (posterBlock.length) lines.push('', ...posterBlock);
  lines.push('', opts.withUrl ? `🔗 View & apply: ${buildShareUrl(trip)}` : '🔗 Link below 👇');
  return lines.join('\n');
}

/** Snapshot a DOM node to a PNG blob (2× for retina; white bg so it's not black on Telegram). */
export async function nodeToPngBlob(node: HTMLElement): Promise<Blob> {
  const blob = await toBlob(node, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true });
  if (!blob) throw new Error('html-to-image returned no blob');
  return blob;
}

/** Trigger a browser download of a blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Friendly download filename, slugged from the route. */
export function shareFilename(trip: Trip): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `tripking-${slug(trip.fromCity.name)}-to-${slug(trip.toCity.name)}-${trip.id}.png`;
}

/** `navigator.share` with the PNG attached + the text caption; degrades to text-only, then to "unsupported". */
export async function nativeShareTrip(blob: Blob, filename: string, caption: string): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return 'unsupported';
  const filesPayload = { files: [new File([blob], filename, { type: 'image/png' })], text: caption, title: 'New trip on TripKing' };
  if (typeof navigator.canShare === 'function' && navigator.canShare(filesPayload)) {
    try {
      await navigator.share(filesPayload);
      return 'shared';
    } catch (err) {
      if ((err as Error).name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.share({ text: caption, title: 'New trip on TripKing' });
    return 'shared';
  } catch (err) {
    return (err as Error).name === 'AbortError' ? 'cancelled' : 'unsupported';
  }
}
