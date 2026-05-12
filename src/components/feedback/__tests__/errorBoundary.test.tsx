import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ErrorBoundary } from '../ErrorBoundary';
import { RouteErrorBoundary } from '../RouteErrorBoundary';
import { isChunkLoadError } from '@/lib/chunkError';

vi.mock('@/lib/sentry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sentry')>();
  return { ...actual, captureDataError: vi.fn() };
});
import { captureDataError } from '@/lib/sentry';

function Boom({ msg = 'kaboom', name }: { msg?: string; name?: string }): never {
  const e = new Error(msg);
  if (name) e.name = name;
  throw e;
}

function withMockedLocation(): { restore: () => void; reload: ReturnType<typeof vi.fn> } {
  const original = window.location;
  const reload = vi.fn();
  Object.defineProperty(window, 'location', { configurable: true, value: { ...window.location, reload } });
  return { restore: () => Object.defineProperty(window, 'location', { configurable: true, value: original }), reload };
}

describe('isChunkLoadError', () => {
  it('matches the known chunk-failure shapes only', () => {
    expect(isChunkLoadError(Object.assign(new Error('x'), { name: 'ChunkLoadError' }))).toBe(true);
    expect(isChunkLoadError(new Error('Loading chunk 12 failed'))).toBe(true);
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module: /a.js'))).toBe(true);
    expect(isChunkLoadError(new Error('some other error'))).toBe(false);
    expect(isChunkLoadError('a string')).toBe(false);
  });
});

describe('ErrorBoundary', () => {
  let loc: ReturnType<typeof withMockedLocation>;
  let consoleErr: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    loc = withMockedLocation();
    consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    loc.restore();
    consoleErr.mockRestore();
  });

  it('renders the fallback and reports a render error to Sentry', () => {
    render(
      <ErrorBoundary>
        <Boom msg="render exploded" />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(captureDataError).toHaveBeenCalledWith('react-render', expect.any(Error), expect.objectContaining({ componentStack: expect.anything() }));
    expect(loc.reload).not.toHaveBeenCalled();
  });

  it('reloads the page on a chunk-load error instead of reporting', () => {
    render(
      <ErrorBoundary>
        <Boom msg="Loading chunk 7 failed" name="ChunkLoadError" />
      </ErrorBoundary>,
    );
    expect(loc.reload).toHaveBeenCalled();
    expect(captureDataError).not.toHaveBeenCalled();
  });

  it('renders a custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<div>custom fallback</div>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByText('custom fallback')).toBeInTheDocument();
  });
});

describe('RouteErrorBoundary', () => {
  let loc: ReturnType<typeof withMockedLocation>;
  let consoleErr: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.clearAllMocks();
    loc = withMockedLocation();
    consoleErr = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    loc.restore();
    consoleErr.mockRestore();
  });

  it('shows the page-level fallback (with a back-home action) when a page crashes, and reports it', () => {
    render(
      <MemoryRouter>
        <RouteErrorBoundary>
          <Boom />
        </RouteErrorBoundary>
      </MemoryRouter>,
    );
    expect(screen.getByText('This page hit a snag')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to home/i })).toBeInTheDocument();
    expect(captureDataError).toHaveBeenCalledWith('route-render', expect.any(Error), expect.anything());
  });
});
