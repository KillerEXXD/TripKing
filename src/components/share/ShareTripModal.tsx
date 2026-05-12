import { useEffect, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Copy, Download, Share2, X } from 'lucide-react';
import { toast } from 'sonner';
import { TripShareCard } from '@/components/share/TripShareCard';
import { buildShareCaption, downloadBlob, nativeShareTrip, nodeToPngBlob, shareFilename } from '@/lib/share/tripShare';
import { Button } from '@/components/ui';
import type { Trip } from '@/types';

export interface ShareTripModalProps {
  trip: Trip;
  /** Close the modal (e.g. stay on the page). */
  onClose: () => void;
  /** "View the trip" action — defaults to nothing extra. */
  onViewTrip?: () => void;
}

// Preview scale: the card is 1080×1200; show it at ~0.28×.
const PREVIEW_SCALE = 0.28;

/**
 * Post-trip share sheet — shows the {@link TripShareCard} preview and lets the
 * poster share it (native share sheet with the PNG + caption), copy the caption,
 * or download the image. Built on Radix Dialog (focus trap / Escape / scroll-lock).
 */
export function ShareTripModal({ trip, onClose, onViewTrip }: ShareTripModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [imgError, setImgError] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Let the offscreen card paint, then snapshot it.
    const t = setTimeout(() => {
      const node = cardRef.current;
      if (!node) return;
      Promise.resolve(nodeToPngBlob(node))
        .then((b) => {
          if (!cancelled && b) setBlob(b);
        })
        .catch(() => {
          if (!cancelled) setImgError(true);
        });
    }, 50);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [trip.id]);

  const caption = buildShareCaption(trip, { withUrl: true });

  async function onShare() {
    if (!blob) {
      await onCopyCaption();
      return;
    }
    setBusy(true);
    try {
      const result = await nativeShareTrip(blob, shareFilename(trip), caption);
      if (result === 'unsupported') await onCopyCaption();
      else if (result === 'shared') toast.success('Trip shared');
    } finally {
      setBusy(false);
    }
  }
  async function onCopyCaption() {
    try {
      await navigator.clipboard.writeText(caption);
      toast.success('Caption copied — paste it into WhatsApp or Telegram');
    } catch {
      toast.error("Couldn't copy — long-press the text to copy it manually");
    }
  }
  function onDownload() {
    if (!blob) {
      toast.error("The image isn't ready yet — try again in a moment");
      return;
    }
    downloadBlob(blob, shareFilename(trip));
  }

  return (
    <Dialog.Root open onOpenChange={(o) => (o ? undefined : onClose())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-card p-4 shadow-xl"
          aria-describedby={undefined}
        >
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-lg font-bold">Share this trip</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close" className="text-secondary hover:text-foreground">
                <X className="size-5" aria-hidden />
              </button>
            </Dialog.Close>
          </div>

          {/* Visible thumbnail */}
          <div
            className="mx-auto overflow-hidden rounded-xl border"
            style={{ width: `${Math.round(1080 * PREVIEW_SCALE)}px`, height: `${Math.round(1200 * PREVIEW_SCALE)}px` }}
            aria-hidden
          >
            <div style={{ transform: `scale(${PREVIEW_SCALE})`, transformOrigin: 'top left' }}>
              <TripShareCard trip={trip} />
            </div>
          </div>

          {imgError ? <p className="mt-2 text-center text-xs text-secondary">Image preview unavailable here — you can still copy the caption.</p> : null}

          <div className="mt-4 grid grid-cols-3 gap-2">
            <Button variant="full" onClick={() => void onShare()} disabled={busy}>
              <Share2 className="size-4" aria-hidden /> Share
            </Button>
            <Button variant="outline" onClick={() => void onCopyCaption()}>
              <Copy className="size-4" aria-hidden /> Caption
            </Button>
            <Button variant="outline" onClick={onDownload} disabled={!blob}>
              <Download className="size-4" aria-hidden /> Image
            </Button>
          </div>

          <div className="mt-3 flex justify-between text-sm">
            <button type="button" className="text-secondary underline" onClick={onClose}>
              Done
            </button>
            {onViewTrip ? (
              <button type="button" className="font-medium text-primary underline" onClick={onViewTrip}>
                View the trip
              </button>
            ) : null}
          </div>

          {/* Full-size offscreen card — the actual snapshot source. */}
          <div style={{ position: 'fixed', left: '-10000px', top: 0, pointerEvents: 'none' }} aria-hidden>
            <TripShareCard ref={cardRef} trip={trip} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default ShareTripModal;
