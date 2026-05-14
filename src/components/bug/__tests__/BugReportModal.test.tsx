import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { axe } from 'vitest-axe';
import type { ReactNode } from 'react';
import { BugReportModal } from '@/components/bug/BugReportModal';

vi.mock('@/lib/api/services/bugReports');
import * as svc from '@/lib/api/services/bugReports';

function Wrap({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.restoreAllMocks());

describe('BugReportModal', () => {
  it('submit disabled until a title is entered, then POSTs and closes', async () => {
    vi.mocked(svc.postBugReport).mockResolvedValue({ id: 'b1', bugNumber: 'BUG-007', title: 't' } as never);
    const onClose = vi.fn();
    render(<Wrap><BugReportModal onClose={onClose} /></Wrap>);

    const submit = screen.getByRole('button', { name: /submit/i });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText(/short summary/i), { target: { value: 'Title here' } });
    expect(submit).not.toBeDisabled();
    fireEvent.click(submit);

    await waitFor(() => {
      expect(svc.postBugReport).toHaveBeenCalled();
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('surfaces the error message when submission throws', async () => {
    vi.mocked(svc.postBugReport).mockRejectedValue(new Error('rate limited'));
    render(<Wrap><BugReportModal onClose={() => undefined} /></Wrap>);
    fireEvent.change(screen.getByPlaceholderText(/short summary/i), { target: { value: 'T' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    await screen.findByRole('alert');
    expect(screen.getByRole('alert').textContent).toMatch(/rate limited/);
  });

  it('has no a11y violations on initial render', async () => {
    const { container } = render(<Wrap><BugReportModal onClose={() => undefined} /></Wrap>);
    // Radix dialog renders aria-modal; ensure no obvious axe regressions.
    expect(await axe(container)).toHaveNoViolations();
  });
});
