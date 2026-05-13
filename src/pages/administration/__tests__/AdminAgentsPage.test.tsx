import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminAgentsPage } from '@/pages/administration/AdminAgentsPage';
import type { Agent } from '@/types';

vi.mock('@/hooks/useDrivers', () => ({ useAgents: vi.fn() }));
import { useAgents } from '@/hooks/useDrivers';

const city = (id: string, name: string) => ({ id, name, state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });
function makeAgent(over: Partial<Agent> = {}): Agent {
  return {
    id: 'a1',
    userId: 'u1',
    fullName: 'Priya Ramesh',
    phone: '+919876500000',
    email: 'priya@example.com',
    businessName: 'Priya Travels',
    businessCity: city('c1', 'Vellore'),
    profilePhotoUrl: '',
    kycStatus: 'approved',
    topTags: [],
    totalTripsPosted: 12,
    ...over,
  } as Agent;
}

type Q = { isPending?: boolean; isError?: boolean; data?: Agent[]; refetch?: () => void };
function setAgents(q: Q = {}) {
  vi.mocked(useAgents).mockReturnValue({ isPending: false, isError: false, data: [], refetch: vi.fn(), ...q } as never);
}
function renderPage() {
  return render(<MemoryRouter><AdminAgentsPage /></MemoryRouter>);
}

describe('AdminAgentsPage', () => {
  beforeEach(() => {
    vi.mocked(useAgents).mockReset();
    setAgents({ data: [] });
  });

  it('lists agents with KYC badge, business, trips and a KYC link', () => {
    setAgents({
      data: [
        makeAgent(),
        makeAgent({ id: 'a2', userId: 'u2', fullName: 'Suresh P', kycStatus: 'pending', businessName: 'SP Tours', totalTripsPosted: 0 }),
      ],
    });
    renderPage();
    expect(screen.getByRole('heading', { name: /^agents$/i })).toBeInTheDocument();
    expect(screen.getByText('Priya Ramesh')).toBeInTheDocument();
    expect(screen.getByText('Verified', { selector: '[data-slot="badge"]' })).toBeInTheDocument();
    expect(screen.getByText(/12 trips posted/i)).toBeInTheDocument();
    expect(screen.getByText('Suresh P')).toBeInTheDocument();
    expect(screen.getByText('Pending', { selector: '[data-slot="badge"]' })).toBeInTheDocument();
    const rowKycLinks = screen.getAllByRole('link', { name: /kyc →/i });
    expect(rowKycLinks[0]).toHaveAttribute('href', '/administration/kyc?agentId=a1');
    expect(rowKycLinks[1]).toHaveAttribute('href', '/administration/kyc?agentId=a2');
  });

  it('filters the loaded list by the search box (name / phone / email / business)', () => {
    setAgents({
      data: [
        makeAgent(),
        makeAgent({ id: 'a2', userId: 'u2', fullName: 'Suresh P', phone: '+918000000000', email: 'suresh@example.com', businessName: 'SP Tours' }),
      ],
    });
    renderPage();
    const search = screen.getByLabelText(/search agents/i);

    fireEvent.change(search, { target: { value: 'suresh' } });
    expect(screen.queryByText('Priya Ramesh')).toBeNull();
    expect(screen.getByText('Suresh P')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'sp tours' } });
    expect(screen.getByText('Suresh P')).toBeInTheDocument();
    expect(screen.queryByText('Priya Ramesh')).toBeNull();

    fireEvent.change(search, { target: { value: '987650' } });
    expect(screen.getByText('Priya Ramesh')).toBeInTheDocument();
    expect(screen.queryByText('Suresh P')).toBeNull();
  });

  it('a KYC chip narrows the server query', () => {
    setAgents({ data: [makeAgent()] });
    renderPage();
    const lastCallArg = () => {
      const calls = vi.mocked(useAgents).mock.calls;
      return calls[calls.length - 1]?.[0];
    };
    expect(lastCallArg()).toEqual({ limit: 200 });
    fireEvent.click(screen.getByRole('button', { name: 'Docs in' }));
    expect(lastCallArg()).toEqual({ kycStatus: 'docs_submitted', limit: 200 });
  });

  it('shows loading, error and empty states', () => {
    setAgents({ isPending: true });
    const { rerender } = renderPage();
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();

    const refetch = vi.fn();
    setAgents({ isError: true, refetch });
    rerender(<MemoryRouter><AdminAgentsPage /></MemoryRouter>);
    expect(screen.getByText(/couldn't load agents/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();

    setAgents({ data: [] });
    rerender(<MemoryRouter><AdminAgentsPage /></MemoryRouter>);
    expect(screen.getByText('No agents')).toBeInTheDocument();
  });
});
