import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ScopedPageHeader } from '@/components/layout/ScopedPageHeader';

function renderHeader(props: Partial<Parameters<typeof ScopedPageHeader>[0]> = {}) {
  return render(
    <MemoryRouter>
      <ScopedPageHeader title="Invites received" subtitle="4 trips waiting" backTo="/" tone="indigo" {...props} />
    </MemoryRouter>,
  );
}

describe('ScopedPageHeader', () => {
  it('renders the title + subtitle + back link to the supplied target', () => {
    renderHeader();
    expect(screen.getByText('Invites received')).toBeInTheDocument();
    expect(screen.getByText('4 trips waiting')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back/i })).toHaveAttribute('href', '/');
  });

  it('tints the band per tone — indigo → purple, blue → blue, emerald → emerald, amber → amber', () => {
    const { container, rerender } = renderHeader({ tone: 'indigo' });
    expect(container.querySelector('header')!.className).toMatch(/bg-purple-50/);
    rerender(
      <MemoryRouter>
        <ScopedPageHeader title="x" backTo="/" tone="blue" />
      </MemoryRouter>,
    );
    expect(container.querySelector('header')!.className).toMatch(/bg-blue-50/);
    rerender(
      <MemoryRouter>
        <ScopedPageHeader title="x" backTo="/" tone="emerald" />
      </MemoryRouter>,
    );
    expect(container.querySelector('header')!.className).toMatch(/bg-emerald-50/);
    rerender(
      <MemoryRouter>
        <ScopedPageHeader title="x" backTo="/" tone="amber" />
      </MemoryRouter>,
    );
    expect(container.querySelector('header')!.className).toMatch(/bg-amber-50/);
  });

  it('renders the optional icon when provided', () => {
    renderHeader({ icon: <svg data-testid="icon" /> });
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders a right-side slot when provided', () => {
    renderHeader({ right: <button type="button">Action</button> });
    expect(screen.getByRole('button', { name: 'Action' })).toBeInTheDocument();
  });
});
