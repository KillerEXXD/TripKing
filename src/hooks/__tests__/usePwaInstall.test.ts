import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePwaInstall } from '@/hooks/usePwaInstall';

type Choice = { outcome: 'accepted' | 'dismissed'; platform: string };

/** Build a fake `beforeinstallprompt` event with a stubbed `prompt()` + `userChoice`. */
function makeInstallEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const prompt = vi.fn().mockResolvedValue(undefined);
  const evt = new Event('beforeinstallprompt') as Event & { prompt: typeof prompt; userChoice: Promise<Choice> };
  evt.prompt = prompt;
  evt.userChoice = Promise.resolve({ outcome, platform: 'web' });
  return { evt, prompt };
}

describe('usePwaInstall', () => {
  it('starts with no native prompt and not installed (jsdom looks like desktop)', () => {
    const { result } = renderHook(() => usePwaInstall());
    expect(result.current.installed).toBe(false);
    expect(result.current.canPrompt).toBe(false);
    expect(result.current.platform).toBe('desktop');
  });

  it('captures a beforeinstallprompt event and exposes canPrompt', () => {
    const { result } = renderHook(() => usePwaInstall());
    const { evt } = makeInstallEvent();
    act(() => {
      window.dispatchEvent(evt);
    });
    expect(result.current.canPrompt).toBe(true);
  });

  it('promptInstall triggers the deferred prompt and marks installed on accept', async () => {
    const { result } = renderHook(() => usePwaInstall());
    const { evt, prompt } = makeInstallEvent('accepted');
    act(() => {
      window.dispatchEvent(evt);
    });
    let outcome: string | undefined;
    await act(async () => {
      outcome = await result.current.promptInstall();
    });
    expect(prompt).toHaveBeenCalled();
    expect(outcome).toBe('accepted');
    expect(result.current.installed).toBe(true);
    expect(result.current.canPrompt).toBe(false);
  });

  it('promptInstall is a no-op (returns "unavailable") when nothing was captured', async () => {
    const { result } = renderHook(() => usePwaInstall());
    await expect(result.current.promptInstall()).resolves.toBe('unavailable');
  });

  it('an appinstalled event marks the app installed', () => {
    const { result } = renderHook(() => usePwaInstall());
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(result.current.installed).toBe(true);
  });
});
