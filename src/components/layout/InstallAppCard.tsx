import { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { toast } from 'sonner';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { Button, Card, CardContent } from '@/components/ui';

export interface InstallAppCardProps {
  /** Render an X to dismiss the card for this session (used on the home screen). */
  dismissable?: boolean;
  className?: string;
}

/**
 * "Add TripKing to your home screen" prompt.
 *  - Chromium / Android: a real "Install app" button (native `beforeinstallprompt`).
 *  - iOS Safari: there's no programmatic install, so we show the Share → "Add to Home Screen" steps.
 *  - Desktop: a hint to use the browser's install icon in the address bar.
 * Renders nothing when the app is already running standalone (or dismissed).
 */
export function InstallAppCard({ dismissable, className }: InstallAppCardProps) {
  const { installed, canPrompt, platform, promptInstall } = usePwaInstall();
  const [dismissed, setDismissed] = useState(false);

  if (installed || dismissed) return null;

  async function onInstall() {
    const outcome = await promptInstall();
    if (outcome === 'accepted') toast.success('Adding TripKing to your home screen…');
  }

  return (
    <Card className={className}>
      <CardContent className="space-y-2.5 py-1">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Smartphone className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">Install TripKing</div>
            <div className="text-xs text-secondary">Add it to your home screen for a full-screen, app-like experience.</div>
          </div>
          {dismissable ? (
            <button type="button" aria-label="Dismiss" onClick={() => setDismissed(true)} className="shrink-0 text-secondary hover:text-foreground">
              <X className="size-4" aria-hidden />
            </button>
          ) : null}
        </div>

        {canPrompt ? (
          <Button variant="full" onClick={() => void onInstall()}>
            <Download className="size-4" aria-hidden /> Install app
          </Button>
        ) : platform === 'ios' ? (
          <p className="rounded-lg border bg-muted px-3 py-2 text-xs leading-relaxed text-secondary">
            On iPhone/iPad: tap the <Share className="-mt-0.5 inline size-3.5" aria-hidden /> <span className="font-medium text-foreground">Share</span> button in
            Safari, then choose <span className="font-medium text-foreground">&quot;Add to Home Screen&quot;</span>.
          </p>
        ) : platform === 'android' ? (
          <p className="rounded-lg border bg-muted px-3 py-2 text-xs leading-relaxed text-secondary">
            On Android: open the browser menu <span className="font-medium text-foreground">(⋮)</span> and tap{' '}
            <span className="font-medium text-foreground">&quot;Install app&quot;</span> / <span className="font-medium text-foreground">&quot;Add to Home screen&quot;</span>.
          </p>
        ) : (
          <p className="rounded-lg border bg-muted px-3 py-2 text-xs leading-relaxed text-secondary">
            In your browser, use the <span className="font-medium text-foreground">install icon</span> in the address bar (or the browser menu) to add TripKing as an app.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default InstallAppCard;
