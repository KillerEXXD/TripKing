import { toBlob } from 'html-to-image';
import type { Trip } from '@/types';
import { formatINR, formatKm } from '@/lib/utils';
import {
  tripCommissionAmount,
  tripDriverBata,
  tripExtrasPaidByPassenger,
} from '@/lib/tripDefaults';
import { mockManagers, mockUsers } from '@/data/mockData';

/**
 * Decode-side lookup maps for the legacy `#d=...` hash format.
 *
 * Newer share links are clean (`/driver/trips/<id>` with nothing appended) —
 * see `buildShareUrl`. We still decode the old hash form so links that were
 * shared before that change keep working.
 *
 * v2 field order: v ~ id ~ fromName ~ fromState ~ toName ~ toState ~
 *   pickupSec ~ distanceKm ~ carCode ~ ac ~ seats ~ ratePerKm ~ totalFare ~
 *   commissionPct ~ gst ~ driverPayout ~ tollCode ~ postedByName ~
 *   passengerCount
 */
const CODE_TO_CAR: Record<string, string> = {
  s: 'Sedan',
  h: 'Hatchback',
  u: 'SUV',
  t: 'Tempo Traveller',
  i: 'Innova',
};

/** Decode a legacy `#d=...` hash fragment into a Trip. Returns null on any
 *  decode error. Supports both v2 (positional) and v1 (JSON) shapes — kept
 *  only so links shared before the clean-URL change still resolve. */
export function decodeTripFromHash(hash: string): Trip | null {
  if (!hash) return null;
  const cleaned = hash.startsWith('#') ? hash.slice(1) : hash;
  const m = cleaned.match(/(?:^|&)d=([^&]+)/);
  if (!m) return null;
  try {
    let b64 = m[1]!;
    while (b64.length % 4 !== 0) b64 += '=';
    const decoded = decodeURIComponent(escape(atob(b64)));

    // v2: starts with `2~`, positional fields
    if (decoded.startsWith('2~')) {
      const f = decoded.split('~');
      if (f.length < 19) return null;
      const pickupSec = Number(f[6]);
      const carCode = f[8]!;
      const tollCode = f[16]!;
      return {
        id: f[1]!,
        postedByUserId: '',
        postedByRole: 'trip_manager',
        postedByName: f[17] || 'Unknown',
        fromCity: {
          id: 'shared-from',
          name: f[2]!,
          state: f[3] || '',
          lat: 0,
          lng: 0,
        },
        toCity: {
          id: 'shared-to',
          name: f[4]!,
          state: f[5] || '',
          lat: 0,
          lng: 0,
        },
        pickupDateTime: new Date(pickupSec * 1000).toISOString(),
        expectedDistanceKm: Number(f[7]),
        carTypeRequired: (CODE_TO_CAR[carCode] ?? carCode) as Trip['carTypeRequired'],
        seatsRequired: Number(f[10]),
        acRequired: f[9] === '1',
        ratePerKm: Number(f[11]),
        totalFare: Number(f[12]),
        commissionPct: Number(f[13]),
        gstAmount: Number(f[14]),
        extrasPaidByPassenger: tollCode !== 'i',
        driverPayout: Number(f[15]),
        passengerName: '',
        passengerPhone: '',
        passengerCount: Number(f[18]),
        status: 'open',
        applicantCount: 0,
        createdAt: new Date().toISOString(),
      };
    }

    // v1: legacy JSON form — keep until old shared links age out
    const parsed = JSON.parse(decoded);
    if (parsed?.v === 1 && typeof parsed.i === 'string' && parsed.f && parsed.t) {
      return {
        id: parsed.i,
        postedByUserId: '',
        postedByRole: 'trip_manager',
        postedByName: parsed.n ?? 'Unknown',
        fromCity: { id: 'shared-from', name: parsed.f, state: parsed.fs, lat: 0, lng: 0 },
        toCity: { id: 'shared-to', name: parsed.t, state: parsed.ts, lat: 0, lng: 0 },
        pickupDateTime: parsed.p,
        expectedDistanceKm: parsed.d,
        carTypeRequired: parsed.c,
        seatsRequired: parsed.s,
        acRequired: parsed.a === 1,
        ratePerKm: parsed.r,
        totalFare: parsed.tf,
        commissionPct: parsed.cm,
        gstAmount: parsed.g,
        extrasPaidByPassenger: parsed.th !== 'included',
        driverPayout: parsed.dp,
        passengerName: '',
        passengerPhone: '',
        passengerCount: parsed.pc,
        status: 'open',
        applicantCount: 0,
        createdAt: new Date().toISOString(),
      };
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Clean deep link to the driver's trip-detail page: `/driver/trips/<id>`.
 *
 * The trip resolves by id on the device where it was posted (it's in that
 * device's localStorage). This prototype has no server, so a link opened on
 * a *different* device can't be looked up and lands on the "trip not found"
 * state — an accepted trade-off for a single-device demo.
 */
export function buildShareUrl(trip: Trip): string {
  const origin =
    typeof window !== 'undefined'
      ? window.location.origin
      : 'https://driver-mahal.vercel.app';
  return `${origin}/driver/trips/${trip.id}`;
}

interface CaptionOptions {
  /** Include the URL inline (for the clipboard fallback). When false, the
   *  caller is expected to share the URL out-of-band — useful with
   *  navigator.share which already takes the URL as a separate field, so
   *  duplicating it in the text would render the link twice in WhatsApp. */
  withUrl?: boolean;
}

/** "24th" / "1st" / "2nd" / "3rd" / "11th". */
function ordinal(n: number): string {
  const suffixes = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] || suffixes[v] || suffixes[0]}`;
}

/** "Monday, 24th April 2026". */
function formatPickupDate(iso: string): string {
  const d = new Date(iso);
  const weekday = d.toLocaleDateString('en-IN', { weekday: 'long' });
  const month = d.toLocaleDateString('en-IN', { month: 'long' });
  return `${weekday}, ${ordinal(d.getDate())} ${month} ${d.getFullYear()}`;
}

/** "11:07 PM". */
function formatPickupTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function placeLabel(city: { name: string; state?: string }): string {
  return city.state ? `${city.name}, ${city.state}` : city.name;
}

/** Poster's contact number — explicit field, else resolved from seed data. */
export function resolvePosterPhone(trip: Trip): string {
  if (trip.postedByPhone) return trip.postedByPhone;
  const mgr = mockManagers.find((m) => m.userId === trip.postedByUserId);
  if (mgr?.phone) return mgr.phone;
  return mockUsers.find((u) => u.id === trip.postedByUserId)?.phone ?? '';
}

/**
 * Plain-text caption for WhatsApp / Telegram (and the clipboard fallback).
 *
 * Three blocks, blank-line separated, each line led by a small icon so the
 * post reads cleanly:
 *   1. Trip — car type, pickup/drop, distance, pickup date + time
 *   2. Money — per-km, commission + GST, bata, approx. driver cost
 *   3. Poster — name + contact number
 * then the deep link (when `withUrl`).
 */
export function buildShareCaption(
  trip: Trip,
  opts: CaptionOptions = { withUrl: true },
): string {
  const acTag = trip.acRequired ? ' · AC' : '';
  const commissionAmount = tripCommissionAmount(trip);
  const bata = tripDriverBata(trip);
  const approxCost =
    Math.max(0, trip.totalFare - commissionAmount - trip.gstAmount) + bata;
  const contact = resolvePosterPhone(trip);

  const tripBlock = [
    `🚗 Car type: ${trip.carTypeRequired}${acTag}`,
    `📍 Pickup: ${placeLabel(trip.fromCity)}`,
    `🏁 Drop: ${placeLabel(trip.toCity)}`,
    `🛣️ Distance: ${formatKm(trip.expectedDistanceKm)}`,
    `📅 Pickup date: ${formatPickupDate(trip.pickupDateTime)}`,
    `🕒 Time: ${formatPickupTime(trip.pickupDateTime)}`,
  ];

  const moneyBlock = [
    `💵 Per km: ${formatINR(trip.ratePerKm)}`,
    `🧾 Commission: ${trip.commissionPct}% + GST ${formatINR(trip.gstAmount)}`,
    `🤝 Bata: ${formatINR(bata)}`,
    `🧳 Packing, toll & permit: ${
      tripExtrasPaidByPassenger(trip) ? 'Extra — paid by passenger' : 'Included in fare'
    }`,
    `≈ Approx. cost: ${formatINR(approxCost)}`,
  ];

  const posterBlock = [
    `👤 Posted by: ${trip.postedByName}`,
    ...(contact ? [`📞 Contact: ${contact}`] : []),
  ];

  const lines = [
    '👑 New trip on Trip King',
    '',
    ...tripBlock,
    '',
    ...moneyBlock,
    '',
    ...posterBlock,
  ];

  if (opts.withUrl) {
    lines.push('', `🔗 Trip King Link: ${buildShareUrl(trip)}`);
  } else {
    lines.push('', '🔗 Trip King Link below 👇');
  }

  return lines.join('\n');
}

/**
 * Snapshot a DOM node into a PNG blob via html-to-image.
 * Renders at 2x pixel ratio for crisp output on retina screens, with a
 * white background so transparent areas don't render black on Telegram.
 */
export async function nodeToPngBlob(node: HTMLElement): Promise<Blob> {
  const blob = await toBlob(node, {
    pixelRatio: 2,
    backgroundColor: '#ffffff',
    cacheBust: true,
  });
  if (!blob) throw new Error('html-to-image returned no blob');
  return blob;
}

/** Trigger a browser download of a blob with the given filename. */
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

/** Slug the trip route into a friendly download filename. */
export function shareFilename(trip: Trip): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  return `tripking-${slug(trip.fromCity.name)}-to-${slug(trip.toCity.name)}-${trip.id}.png`;
}

/**
 * Wrapper around navigator.share that gracefully degrades.
 *
 * The card image carries all the trip details, so the accompanying `caption`
 * is short and already contains the "Trip King Link: <url>" line — we do NOT
 * pass `url` as a separate field (that would render the link twice).
 */
export async function nativeShareTrip(
  blob: Blob,
  filename: string,
  caption: string,
): Promise<'shared' | 'cancelled' | 'unsupported'> {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') {
    return 'unsupported';
  }

  const file = new File([blob], filename, { type: 'image/png' });
  const filesPayload = {
    files: [file],
    text: caption,
    title: 'New trip on Trip King',
  };

  if (
    typeof navigator.canShare === 'function' &&
    navigator.canShare(filesPayload)
  ) {
    try {
      await navigator.share(filesPayload);
      return 'shared';
    } catch (err) {
      if ((err as Error).name === 'AbortError') return 'cancelled';
    }
  }

  // Soft fallback: share the caption text only (no image attachment) —
  // it still contains the Trip King link.
  try {
    await navigator.share({ text: caption, title: 'New trip on Trip King' });
    return 'shared';
  } catch (err) {
    if ((err as Error).name === 'AbortError') return 'cancelled';
    return 'unsupported';
  }
}
