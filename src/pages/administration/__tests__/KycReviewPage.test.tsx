import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { KycReviewPage } from '@/pages/administration/KycReviewPage';

vi.mock('@/hooks/useDrivers', () => ({ useDrivers: vi.fn(), useAgents: vi.fn(), useUpdateDriverKyc: vi.fn(), useUpdateAgentKyc: vi.fn() }));
import { useAgents, useDrivers, useUpdateAgentKyc, useUpdateDriverKyc } from '@/hooks/useDrivers';

const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 0, lng: 0, sortOrder: 1, isActive: true });

type ListState = { isPending?: boolean; isError?: boolean; data?: unknown[]; refetch?: () => void };
function setDrivers(s: ListState = {}) {
  vi.mocked(useDrivers).mockReturnValue({ isPending: false, isError: false, data: [], refetch: vi.fn(), ...s } as never);
}
function setAgents(s: ListState = {}) {
  vi.mocked(useAgents).mockReturnValue({ isPending: false, isError: false, data: [], refetch: vi.fn(), ...s } as never);
}
function setMutations() {
  const dm = { mutate: vi.fn(), isPending: false };
  const am = { mutate: vi.fn(), isPending: false };
  vi.mocked(useUpdateDriverKyc).mockReturnValue(dm as never);
  vi.mocked(useUpdateAgentKyc).mockReturnValue(am as never);
  return { dm, am };
}

function renderKyc() {
  return render(
    <MemoryRouter>
      <KycReviewPage />
    </MemoryRouter>,
  );
}

describe('KycReviewPage', () => {
  beforeEach(() => {
    vi.mocked(useDrivers).mockReset();
    vi.mocked(useAgents).mockReset();
    vi.mocked(useUpdateDriverKyc).mockReset();
    vi.mocked(useUpdateAgentKyc).mockReset();
    setDrivers({ data: [] });
    setAgents({ data: [] });
    setMutations();
  });

  it('shows a skeleton while drivers load', () => {
    setDrivers({ isPending: true });
    renderKyc();
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('shows an error state with retry when drivers fail to load', () => {
    const refetch = vi.fn();
    setDrivers({ isError: true, refetch });
    renderKyc();
    expect(screen.getByText(/couldn't load drivers/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('defaults to the "needs review" filter (hides approved/rejected drivers)', () => {
    setDrivers({ data: [{ id: 'd1', fullName: 'Needs Review', displayHandle: 'A1B2C3D', canReportBugs: false, currentCity: city('c1', 'Vellore'), kycStatus: 'docs_submitted' }, { id: 'd2', fullName: 'Already Approved', kycStatus: 'approved' }] });
    renderKyc();
    expect(screen.getByText('Needs Review')).toBeInTheDocument();
    expect(screen.queryByText('Already Approved')).toBeNull();
  });

  it('approving a driver calls useUpdateDriverKyc; the current-status button is disabled', () => {
    const { dm } = setMutations();
    setDrivers({ data: [{ id: 'd1', fullName: 'Ravi', displayHandle: 'A1B2C3D', canReportBugs: false, kycStatus: 'docs_submitted' }] });
    renderKyc();
    expect(screen.getByRole('button', { name: /docs in/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }));
    expect(dm.mutate).toHaveBeenCalledWith({ id: 'd1', kycStatus: 'approved' });
  });

  it('switching to "Agents" shows the agent queue, and approving an agent calls useUpdateAgentKyc', () => {
    const { am } = setMutations();
    setAgents({ data: [{ id: 'a1', fullName: 'Agent X', displayHandle: 'A1B2C3D', canReportBugs: false, businessName: 'X Travels', kycStatus: 'pending' }] });
    renderKyc();
    fireEvent.click(screen.getByRole('button', { name: /^agents$/i }));
    expect(screen.getByText('Agent X')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^approve$/i }));
    expect(am.mutate).toHaveBeenCalledWith({ id: 'a1', kycStatus: 'approved' });
  });

  it('the "Approved" filter shows approved entries', () => {
    setDrivers({ data: [{ id: 'd1', fullName: 'Approved One', displayHandle: 'A1B2C3D', canReportBugs: false, kycStatus: 'approved' }] });
    renderKyc();
    expect(screen.queryByText('Approved One')).toBeNull(); // hidden under "needs review"
    fireEvent.click(screen.getByRole('button', { name: /^approved$/i }));
    expect(screen.getByText('Approved One')).toBeInTheDocument();
  });

  it('shows an empty state when no entries match', () => {
    setDrivers({ data: [] });
    renderKyc();
    expect(screen.getByText(/nothing here/i)).toBeInTheDocument();
  });
});
