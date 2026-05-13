import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), message: vi.fn() } }));
vi.mock('@/lib/sentry', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/sentry')>();
  return { ...actual, captureDataError: vi.fn() };
});

import { AdministrationPage } from '@/pages/administration/AdministrationPage';
import { toast } from 'sonner';
import { captureDataError } from '@/lib/sentry';

function renderPage() {
  return render(
    <MemoryRouter>
      <AdministrationPage />
    </MemoryRouter>,
  );
}

describe('AdministrationPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the hub sections and the diagnostics panel', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /administration/i, level: 1 })).toBeInTheDocument();
    expect(screen.getAllByText('Reference data').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Operations')).toBeInTheDocument();
    expect(screen.getByText('Diagnostics')).toBeInTheDocument();
    for (const label of ['Throw a render error', 'Reject a promise', 'Trigger a server 500', 'Trigger a transform error']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('"Trigger a transform error" reports it to Sentry and toasts', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'Trigger a transform error' }));
    await waitFor(() => expect(captureDataError).toHaveBeenCalledWith('diagnostic:transform', expect.any(Error)));
    expect(toast.error).toHaveBeenCalled();
  });
});
