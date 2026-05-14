import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Check, Copy, ExternalLink, Share2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui';
import { formatPickupTime } from '@/lib/utils';
import type { Trip } from '@/types';

export interface PassengerLinkModalProps {
  trip: Trip;
  /** The passenger OTP (from `POST /trips/:id/assign` or echoed on `GET /trips/:id`). */
  otp: string;
  onClose: () => void;
}

function passengerLink(otp: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://trip-king.vercel.app';
  return `${origin}/passenger/${encodeURIComponent(otp)}`;
}

/**
 * "Share with the passenger" sheet — shown after a driver is assigned. Hands the
 * trip poster a link to the public passenger portal (`/passenger/<otp>`, so the
 * passenger doesn't type the OTP) which they forward over WhatsApp/SMS; the
 * passenger then sees the trip, the assigned driver, and the live driver
 * position + ETA. Native share where available, plus copy. Built on Radix Dialog.
 */
export function PassengerLinkModal({ trip, otp, onClose }: PassengerLinkModalProps) {
  const url = passengerLink(otp);
  const caption = `Your TripKing trip is confirmed — ${trip.fromCity.name} → ${trip.toCity.name}, pickup ${formatPickupTime(trip.pickupAt)}. Track your driver and see the details here: ${url}`;
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  async function onCopy() {
    try {
      await navigator.clipboard?.writeText(caption);
      setCopied(true);
      toast.success('Link copied — paste it to the passenger.');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy automatically — select the link and copy it.");
    }
  }
  async function onShare() {
    try {
      await navigator.share({ title: 'Your TripKing trip', text: caption });
    } catch {
      /* user dismissed the share sheet — no-op */
    }
  }

  return (
    <Dialog.Root open onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-2xl bg-white p-5 shadow-xl">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="text-base font-semibold">Share with the passenger</Dialog.Title>
              <Dialog.Description className="text-xs text-secondary">
                {trip.fromCity.name} → {trip.toCity.name} · pickup {formatPickupTime(trip.pickupAt)}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close" className="-mr-1 -mt-1 flex size-8 items-center justify-center rounded-full text-secondary hover:bg-muted">
                <X className="size-5" aria-hidden />
              </button>
            </Dialog.Close>
          </div>

          <p className="mb-2 text-sm text-secondary">
            Send the passenger this link — it opens their trip page with no login (the OTP is in the link), where they can see the assigned driver, call them, and watch the driver&apos;s live location and ETA.
          </p>

          <div className="mb-3 flex items-center gap-2 rounded-lg border border-input bg-muted/40 px-3 py-2">
            <span className="truncate font-mono text-xs">{url}</span>
            <button type="button" onClick={() => void onCopy()} aria-label="Copy the passenger link" className="ml-auto flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10">
              {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {canShare ? (
              <Button variant="full" size="lg" onClick={() => void onShare()}>
                <Share2 className="size-4" aria-hidden /> Share the link
              </Button>
            ) : (
              <Button variant="full" size="lg" onClick={() => void onCopy()}>
                <Copy className="size-4" aria-hidden /> Copy the link
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <a href={url} target="_blank" rel="noopener noreferrer">
                Open the passenger view <ExternalLink className="size-3.5" aria-hidden />
              </a>
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default PassengerLinkModal;
