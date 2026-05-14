import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { ReactNode } from 'react';
import BugsPage, { buildClaudeMarkdown } from '@/pages/administration/BugsPage';
import type { BugReport } from '@/types';

vi.mock('@/lib/api/services/bugReports');
import * as svc from '@/lib/api/services/bugReports';

function makeBug(overrides: Partial<BugReport> = {}): BugReport {
  return {
    id: 'b1',
    bugNumber: 'BUG-001',
    title: 'Map crash',
    description: 'd',
    stepsToReproduce: '1. open\n2. boom',
    expected: 'no crash',
    actual: 'crash',
    priority: 'high',
    category: 'map_location',
    status: 'open',
    reporterId: 'u9',
    reporterRole: 'driver',
    reporterPhone: '+91',
    reporterName: 'Ravi',
    pageUrl: 'https://x',
    route: '/trips',
    browserInfo: {},
    appVersion: '0.1.0',
    consoleLogs: 'LOG hi',
    breadcrumbs: [{ a: 1 }],
    context: { foo: 'bar' },
    queryCacheSnapshot: [{ k: ['trips'] }],
    resolutionNotes: '',
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    attachments: [],
    comments: [],
    ...overrides,
  };
}

function setup(initialUrl = '/administration/bugs') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  function Wrap({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[initialUrl]}>
          <Routes>
            <Route path="/administration/bugs" element={children} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }
  return { qc, Wrap };
}

beforeEach(() => vi.restoreAllMocks());

describe('BugsPage', () => {
  it('lists bugs and filters by status param', async () => {
    vi.mocked(svc.getBugReports).mockResolvedValue([makeBug()]);
    const { Wrap } = setup();
    render(<Wrap><BugsPage /></Wrap>);
    await screen.findByText('Map crash');
    expect(screen.getByText('BUG-001')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/status filter/i), { target: { value: 'open' } });
    await waitFor(() => expect(svc.getBugReports).toHaveBeenCalledWith(expect.objectContaining({ status: 'open' })));
  });

  it('opens detail on row click and PATCHes status from the detail select', async () => {
    vi.mocked(svc.getBugReports).mockResolvedValue([makeBug()]);
    vi.mocked(svc.getBugReport).mockResolvedValue(makeBug());
    vi.mocked(svc.getBugComments).mockResolvedValue([]);
    vi.mocked(svc.patchBugReport).mockResolvedValue(makeBug({ status: 'in_progress' }));
    const { Wrap } = setup();
    render(<Wrap><BugsPage /></Wrap>);
    fireEvent.click(await screen.findByText('Map crash'));
    // Detail loads
    await waitFor(() => expect(svc.getBugReport).toHaveBeenCalledWith('b1'));
    const statusSelect = await screen.findByLabelText(/^status$/i);
    fireEvent.change(statusSelect, { target: { value: 'in_progress' } });
    await waitFor(() =>
      expect(svc.patchBugReport).toHaveBeenCalledWith('b1', expect.objectContaining({ status: 'in_progress' })),
    );
  });
});

describe('buildClaudeMarkdown', () => {
  it('produces a markdown dump with all the major sections', () => {
    const md = buildClaudeMarkdown(makeBug(), [
      { userName: 'A', userRole: 'admin', content: 'looked', createdAt: '2026-01-02T00:00:00Z' },
    ]);
    expect(md).toMatch(/^# BUG-001: Map crash/);
    expect(md).toMatch(/Status: \*\*open\*\*/);
    expect(md).toMatch(/## Steps to reproduce/);
    expect(md).toMatch(/## Console logs/);
    expect(md).toMatch(/## Comments[\s\S]*\*\*A\*\* \(admin/);
  });
});
