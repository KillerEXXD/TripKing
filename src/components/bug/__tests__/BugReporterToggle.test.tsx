import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { BugReporterToggle } from '@/components/bug/BugReporterToggle';

vi.mock('@/lib/api/services/bugReports');
import * as svc from '@/lib/api/services/bugReports';

function Wrap({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.restoreAllMocks());

describe('BugReporterToggle', () => {
  it('flips optimistically and PATCHes /admin/users/:id', async () => {
    vi.mocked(svc.setCanReportBugs).mockResolvedValue(undefined as never);
    render(<Wrap><BugReporterToggle userId="u1" /></Wrap>);
    const sw = screen.getByRole('switch');
    expect(sw).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(sw);
    expect(sw).toHaveAttribute('aria-checked', 'true');
    await waitFor(() => expect(svc.setCanReportBugs).toHaveBeenCalledWith('u1', true));
  });

  it('reverts the optimistic flip on mutation failure', async () => {
    vi.mocked(svc.setCanReportBugs).mockRejectedValue(new Error('nope'));
    render(<Wrap><BugReporterToggle userId="u1" initial /></Wrap>);
    const sw = screen.getByRole('switch');
    expect(sw).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(sw);
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true')); // reverted
  });
});
