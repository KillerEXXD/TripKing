import { useEffect, useRef, useState } from 'react';
import {
  X,
  Share2,
  Download,
  Copy,
  Loader2,
  Check,
  Smartphone,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { TripShareCard } from './TripShareCard';
import {
  buildShareCaption,
  buildShareUrl,
  downloadBlob,
  nativeShareTrip,
  nodeToPngBlob,
  shareFilename,
} from '@/lib/share/tripShare';
import type { Trip } from '@/types';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  trip: Trip;
  open: boolean;
  onClose: () => void;
}

/**
 * Inline modal that previews the share card and offers Share / Download / Copy.
 *
 * The card is rendered TWICE:
 *   1. An offscreen 1080x1350 source node (positioned far off the visible
 *      viewport) — this is what html-to-image snapshots into a PNG. Rendering
 *      offscreen keeps it at full resolution without bothering the user.
 *   2. A scaled-down copy in the visible preview area for the user to see.
 *      We use a CSS transform so the scaled-down version matches what the
 *      shared image will look like.
 */
export function ShareTripModal({ trip, open, onClose }: Props) {
  const sourceRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<'share' | 'download' | 'copy' | null>(null);
  const [copied, setCopied] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const url = buildShareUrl(trip);
  // The card image carries all the details, so the post is: [card] then a
  // short caption with the Trip King link. The "Copy text + link" path uses
  // the full text breakdown (for channels that don't render images).
  const captionForShare = `👑 New trip on Trip King\n\n🔗 Trip King Link: ${url}`;
  const captionForCopy = buildShareCaption(trip, { withUrl: true });
  const filename = shareFilename(trip);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const handleShare = async () => {
    if (!sourceRef.current) return;
    setBusy('share');
    try {
      const blob = await nodeToPngBlob(sourceRef.current);
      const result = await nativeShareTrip(blob, filename, captionForShare);
      if (result === 'unsupported') {
        toast.message('Native share unavailable on this browser', {
          description: 'Use Download or Copy instead.',
        });
      } else if (result === 'shared') {
        toast.success('Shared!');
        onClose();
      }
    } catch (err) {
      toast.error('Could not generate the card image. Try Copy instead.');
    } finally {
      setBusy(null);
    }
  };

  const handleDownload = async () => {
    if (!sourceRef.current) return;
    setBusy('download');
    try {
      const blob = await nodeToPngBlob(sourceRef.current);
      downloadBlob(blob, filename);
      toast.success('Card downloaded');
    } catch (err) {
      toast.error('Could not generate the card image.');
    } finally {
      setBusy(null);
    }
  };

  const handleCopy = async () => {
    setBusy('copy');
    try {
      await navigator.clipboard.writeText(captionForCopy);
      setCopied(true);
      toast.success('Caption copied — paste into any chat');
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      toast.error('Clipboard not available. Long-press the text instead.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Share this trip"
    >
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Close share dialog"
        onClick={onClose}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />

      {/* Sheet */}
      <div
        className="relative w-full sm:w-auto sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Share trip
            </div>
            <div className="font-bold text-sm truncate">
              {trip.fromCity.name} → {trip.toCity.name}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 -mr-2 rounded-full hover:bg-muted text-muted-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Preview — scaled-down copy of the card */}
        <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
          <div
            className="bg-white rounded-2xl shadow-sm overflow-hidden mx-auto"
            style={{ width: '320px' }}
          >
            {/* The visible preview is the same component at scale. We render
                the card at its native 1080px width then transform-scale to fit
                the 320px preview slot, so the user sees exactly what the
                shared image will look like. */}
            <div
              style={{
                width: '1080px',
                transform: 'scale(0.296)', // 320 / 1080
                transformOrigin: 'top left',
              }}
            >
              <TripShareCard trip={trip} url={url} />
            </div>
            {/* Reserve enough height post-scale so the preview block sizes correctly */}
            <div style={{ height: 0 }} />
          </div>

          <p className="text-[11px] text-muted-foreground text-center mt-3 px-4">
            This posts the card to WhatsApp with the trip link below it.
            Drivers tap the link or scan the QR to apply.
          </p>
        </div>

        {/* Action buttons */}
        <div className="border-t p-3 space-y-2 bg-white">
          <Button
            variant="full"
            size="lg"
            className="w-full"
            onClick={handleShare}
            disabled={busy !== null}
          >
            {busy === 'share' ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Preparing image…
              </>
            ) : (
              <>
                <Share2 className="size-5" /> Share to WhatsApp
              </>
            )}
          </Button>

          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            className="w-full text-xs text-muted-foreground hover:text-foreground py-1"
          >
            {showMore ? 'Hide more options ▲' : 'More options ▼'}
          </button>

          {showMore && (
          <div className="space-y-2 pt-1">
            <div className="rounded-xl border bg-gray-50 px-3 py-2.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">
                🔗 Trip King Link
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={url}
                  className="font-mono text-[12px] text-emerald-700 break-all flex-1 hover:underline"
                >
                  {url}
                </a>
                <button
                  type="button"
                  aria-label="Copy link"
                  onClick={() => {
                    navigator.clipboard
                      ?.writeText(url)
                      .then(() => toast.success('Link copied'))
                      .catch(() => undefined);
                  }}
                  className="shrink-0 text-muted-foreground hover:text-foreground"
                >
                  <Copy className="size-4" />
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={busy !== null}
            >
              {busy === 'download' ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" /> Working…
                </>
              ) : (
                <>
                  <Download className="size-4" /> Download image
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              disabled={busy !== null}
              className={cn(copied && 'border-emerald-300 text-emerald-700')}
            >
              {copied ? (
                <>
                  <Check className="size-4" /> Copied!
                </>
              ) : (
                <>
                  <Copy className="size-4" /> Copy text + link
                </>
              )}
            </Button>
            </div>
          </div>
          )}
          <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground px-1 pt-1">
            <Smartphone className="size-3 mt-0.5 shrink-0" />
            <span>
              On mobile, "Share to WhatsApp" opens the share sheet
              (WhatsApp / Telegram / Instagram). On desktop, use "More options".
            </span>
          </div>
        </div>
      </div>

      {/* Offscreen full-resolution source for html-to-image to snapshot.
          Positioned far off-viewport so it doesn't affect layout/scroll. */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0,
          left: '-20000px',
          pointerEvents: 'none',
        }}
      >
        <TripShareCard ref={sourceRef} trip={trip} url={url} />
      </div>
    </div>
  );
}
