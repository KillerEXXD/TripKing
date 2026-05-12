import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Suspense, type FC } from 'react';
import { lazyWithRetry } from '@/lib/lazyWithRetry';

describe('lazyWithRetry', () => {
  let original: Location;
  let reload: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    original = window.location;
    reload = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload } });
  });
  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: original });
    vi.restoreAllMocks();
  });

  it('renders the lazily-imported component on success', async () => {
    const Lazy = lazyWithRetry<FC>(async () => ({ default: () => <div>loaded ok</div> }));
    render(
      <Suspense fallback={<div>loading…</div>}>
        <Lazy />
      </Suspense>,
    );
    expect(screen.getByText('loading…')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('loaded ok')).toBeInTheDocument());
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads for the latest bundle when the chunk import fails (and stays suspended)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const Lazy = lazyWithRetry<FC>(async () => {
      throw new Error('Failed to fetch dynamically imported module: /assets/x.js');
    });
    render(
      <Suspense fallback={<div>loading…</div>}>
        <Lazy />
      </Suspense>,
    );
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(screen.getByText('loading…')).toBeInTheDocument();
  });
});
