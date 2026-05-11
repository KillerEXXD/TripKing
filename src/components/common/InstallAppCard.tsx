import { useState } from 'react';
import { Download, Share, Smartphone, X } from 'lucide-react';
import { usePwaInstall } from '@/hooks/usePwaInstall';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

interface Props {
  /** Show an X to dismiss for this session (used on the Home screen). */
  dismissable?: boolean;
  className?: string;
}

/**
 * "Install / Add to Home Screen" prompt.
 *
 *  - Chromium / Android: a real "Install app" button that fires the native
 *    `beforeinstallprompt` flow.
 *  - iOS Safari: there's no programmatic install, so we show the
 *    Share → "Add to Home Screen" instructions.
 *  - Desktop: a hint to use the browser's install icon in the address bar.
 *
 * Renders nothing if the app is already running standalone.
 */
export function InstallAppCard({ dismissable, className }: Props) {
  const { installed, canPrompt, platform, promptInstall } = usePwaInstall();
  const [dismissed, setDismissed] = useState(false);

  if (installed || dismissed) return null;

  const onInstall = async () => {
    const outcome = await promptInstall();
    if (outcome === 'accepted') toast.success('Installing Trip King…');
  };

  return (
    <Card className={className}>
      <CardContent className="space-y-2.5 py-4">
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 shrink-0">
            <Smartphone className="size-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm">Install Trip King</div>
            <div className="text-xs text-muted-foreground">
              Add it to your home screen for a full-screen, app-like experience.
            </div>
          </div>
          {dismissable && (
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setDismissed(true)}
              className="text-muted-foreground hover:text-foreground shrink-0"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {canPrompt ? (
          <Button variant="full" className="w-full" onClick={onInstall}>
            <Download className="size-4" /> Install app
          </Button>
        ) : platform === 'ios' ? (
          <div className="text-xs text-muted-foreground bg-gray-50 border rounded-lg px-3 py-2 leading-relaxed">
            On iPhone/iPad: tap the <Share className="inline size-3.5 -mt-0.5" />{' '}
            <span className="font-medium text-foreground">Share</span> button in
            Safari, then choose{' '}
            <span className="font-medium text-foreground">"Add to Home Screen"</span>.
          </div>
        ) : platform === 'android' ? (
          <div className="text-xs text-muted-foreground bg-gray-50 border rounded-lg px-3 py-2 leading-relaxed">
            On Android: open the browser menu{' '}
            <span className="font-medium text-foreground">(⋮)</span> and tap{' '}
            <span className="font-medium text-foreground">"Install app"</span> /{' '}
            <span className="font-medium text-foreground">"Add to Home screen"</span>.
          </div>
        ) : (
          <div className="text-xs text-muted-foreground bg-gray-50 border rounded-lg px-3 py-2 leading-relaxed">
            In your browser, use the{' '}
            <span className="font-medium text-foreground">install icon</span> in the
            address bar (or the browser menu) to add Trip King as an app.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
