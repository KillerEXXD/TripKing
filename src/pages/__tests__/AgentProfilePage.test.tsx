import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AgentProfilePage } from '@/pages/AgentProfilePage';
import { ApiError } from '@/lib/api/client';
import type { Agent } from '@/types';

vi.mock('@/hooks/useDrivers', () => ({ useAgent: vi.fn() }));
import { useAgent } from '@/hooks/useDrivers';
vi.mock('@/hooks/useReviews', () => ({ useDriverReviews: vi.fn() }));
import { useDriverReviews } from '@/hooks/useReviews';

const city = (id: string, name: string) => ({ id, name, state: 'Tamil Nadu', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true });
function makeAgent(over: Partial<Agent> = {}): Agent {
  return {
    id: 'a1',
    userId: 'u1',
    fullName: 'Priya Ramesh',
    displayHandle: 'AAGENT1',
    phone: '+919876500001',
    businessName: 'PR Travels',
    businessCity: city('c1', 'Vellore'),
    profilePhotoUrl: '',
    kycStatus: 'approved',
    topTags: ['Pays on time'],
    totalTripsPosted: 27,
    ...over,
  };
}

type AgentState = { isPending?: boolean; isError?: boolean; error?: unknown; data?: Agent; refetch?: () => void };
function setAgent(state: AgentState) {
  vi.mocked(useAgent).mockReturnValue({ isPending: false, isError: false, error: null, data: undefined, refetch: vi.fn(), ...state } as never);
}

function renderProfile() {
  return render(
    <MemoryRouter initialEntries={['/agents/a1']}>
      <Routes>
        <Route path="/agents/:id" element={<AgentProfilePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AgentProfilePage', () => {
  beforeEach(() => {
    vi.mocked(useAgent).mockReset();
    vi.mocked(useDriverReviews).mockReset().mockReturnValue({ isPending: false, isError: false, data: [], refetch: vi.fn() } as never);
  });

  it('renders a skeleton while the profile loads', () => {
    setAgent({ isPending: true });
    renderProfile();
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('renders an error state with retry on a generic failure', () => {
    const refetch = vi.fn();
    setAgent({ isError: true, error: new Error('boom'), refetch });
    renderProfile();
    expect(screen.getByText(/couldn't load this profile/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('renders a "not found" state on a 404', () => {
    setAgent({ isError: true, error: new ApiError('Agent not found', 404) });
    renderProfile();
    expect(screen.getByText(/agent not found/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /try again/i })).toBeNull();
  });

  it('renders the agent name, handle, KYC badge, business and tags', () => {
    setAgent({ data: makeAgent() });
    renderProfile();
    expect(screen.getByRole('heading', { name: 'Priya Ramesh' })).toBeInTheDocument();
    expect(screen.getByText('AAGENT1')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.getByText(/27 trips posted/i)).toBeInTheDocument();
    expect(screen.getByText('PR Travels')).toBeInTheDocument();
    expect(screen.getByText(/based in:/i)).toBeInTheDocument();
    expect(screen.getByText('★ Pays on time')).toBeInTheDocument();
  });

  it('falls back to "Agent <handle>" and hides the Call button on a pre-reveal row', () => {
    setAgent({ data: makeAgent({ fullName: '', phone: '', profilePhotoUrl: '' }) });
    renderProfile();
    expect(screen.getByRole('heading', { name: /agent aagent1/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /call/i })).toBeNull();
  });
});
