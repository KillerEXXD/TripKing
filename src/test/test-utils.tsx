/**
 * Test render helpers.
 *
 * `renderWithProviders` wraps a component in the providers it needs at test
 * time. A `QueryClientProvider` (with retries off + `gcTime: Infinity`) and a
 * `MemoryRouter` are added here once the real providers land — for now it's a
 * thin wrapper so call sites can already use it.
 */
import { type ReactElement, type ReactNode } from 'react';
import { render, type RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

function AllProviders({ children }: { children: ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) {
  return render(ui, { wrapper: AllProviders, ...options });
}

export * from '@testing-library/react';
