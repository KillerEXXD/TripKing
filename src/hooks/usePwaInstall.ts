import { useEffect, useState } from 'react';

/**
 * The non-standard event Chromium fires before showing its native install
 * mini-infobar. We capture it so the app can trigger the prompt from its own UI.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export type InstallPlatform = 'ios' | 'android' | 'desktop';

export interface UsePwaInstallReturn {
  /** Already running as an installed PWA (standalone display mode). */
  installed: boolean;
  /** A native install prompt is available (Chromium / Android). */
  canPrompt: boolean;
  /** Best-effort platform sniff, for showing the right instructions. */
  platform: InstallPlatform;
  /** Trigger the native prompt. No-op (returns `'unavailable'`) when `canPrompt` is false. */
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // `matchMedia` may be absent (or, in tests with reset mocks, return undefined).
  if (window.matchMedia?.('(display-mode: standalone)')?.matches) return true;
  // iOS Safari exposes navigator.standalone.
  return (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

function detectPlatform(): InstallPlatform {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  // iPadOS 13+ reports as Mac — treat touch Macs as iOS for install hints.
  if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}

/**
 * PWA-install helper. Listens for `beforeinstallprompt` / `appinstalled`, sniffs
 * the platform, and exposes `promptInstall()` for Chromium. iOS has no
 * programmatic install — callers show "Share → Add to Home Screen" instructions
 * when `platform === 'ios'`. Used by {@link import('@/components/layout/InstallAppCard')}.
 */
export function usePwaInstall(): UsePwaInstallReturn {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState<boolean>(() => detectStandalone());
  const platform = detectPlatform();

  useEffect(() => {
    const onBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const promptInstall = async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferred) return 'unavailable';
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === 'accepted') setInstalled(true);
    return outcome;
  };

  return { installed, canPrompt: !!deferred, platform, promptInstall };
}

export default usePwaInstall;
