import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { VerifyDocumentsPage } from '@/pages/VerifyDocumentsPage';
import type { Agent, Driver, User } from '@/types';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
import { useAuth } from '@/contexts/AuthContext';
vi.mock('@/hooks/useDrivers', () => ({ useMyDriver: vi.fn(), useMyAgent: vi.fn(), useSubmitDriverKycDocs: vi.fn(), useSubmitAgentKycDocs: vi.fn() }));
import { useMyAgent, useMyDriver, useSubmitAgentKycDocs, useSubmitDriverKycDocs } from '@/hooks/useDrivers';
vi.mock('@/lib/api/services/drivers', () => ({ getDriverKycDocUploadUrl: vi.fn(), getAgentKycDocUploadUrl: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/components/form', () => ({
  FileUpload: ({ label, onUploaded }: { label: string; onUploaded: (p: string) => void }) => (
    <button type="button" aria-label={label} onClick={() => onUploaded(`path/${label}`)}>{label}</button>
  ),
}));

const city = { id: 'c1', name: 'Vellore', state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true, canReportBugs: false };
const driver: Driver = { id: 'd1', userId: 'u1', fullName: 'Ravi', displayHandle: 'A1B2C3D', phone: '+91', homeCity: city, currentCity: city, profilePhotoUrl: '', kycStatus: 'pending', ratingAvg: 0, ratingCount: 0, ratingDistribution: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 }, topTags: [], managerTopTags: [], totalTripsCompleted: 0, vehicles: [], verification: { kycStatus: 'pending', steps: { details: 'done', documents: 'todo' }, stepsDone: 1, stepsTotal: 5 } };
const agent: Agent = { id: 'a1', userId: 'u2', fullName: 'Agent A', displayHandle: 'A1B2C3D', phone: '+91', businessName: 'A Travels', businessCity: city, profilePhotoUrl: '', kycStatus: 'pending', topTags: [], totalTripsPosted: 0, verification: { kycStatus: 'pending', steps: { details: 'done', documents: 'todo', video_call: 'todo' }, stepsDone: 1, stepsTotal: 3 } };

const driverUser: User = { id: 'u1', role: 'driver', phone: '+91', displayName: 'Ravi', preferredLanguage: 'en', isActive: true, canReportBugs: false };
const agentUser: User = { id: 'u2', role: 'trip_manager', phone: '+91', displayName: 'Agent A', preferredLanguage: 'en', isActive: true, canReportBugs: false };

function setUser(u: User) {
  vi.mocked(useAuth).mockReturnValue({ user: u, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() });
}
function setQuery(mock: ReturnType<typeof vi.fn>, data: unknown) {
  mock.mockReturnValue({ isPending: false, isError: false, data, refetch: vi.fn() } as never);
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/verify/documents']}>
      <Routes>
        <Route path="/verify/documents" element={<VerifyDocumentsPage />} />
        <Route path="/profile" element={<div>profile page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('VerifyDocumentsPage', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReset();
    vi.mocked(useMyDriver).mockReset();
    vi.mocked(useMyAgent).mockReset();
    vi.mocked(useSubmitDriverKycDocs).mockReset();
    vi.mocked(useSubmitAgentKycDocs).mockReset();
    setQuery(vi.mocked(useMyDriver), driver);
    setQuery(vi.mocked(useMyAgent), agent);
    vi.mocked(useSubmitDriverKycDocs).mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue(driver), isPending: false } as never);
    vi.mocked(useSubmitAgentKycDocs).mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue(agent), isPending: false } as never);
  });

  it('the driver form has the driving-licence fields', () => {
    setUser(driverUser);
    renderPage();
    expect(screen.getByLabelText('Driving licence')).toBeInTheDocument();
    expect(screen.getByText('Licence number')).toBeInTheDocument();
    expect(screen.getByText(/real, licensed driver/i)).toBeInTheDocument();
  });

  it('the agent form omits the driving licence and submits via the agent path', async () => {
    setUser(agentUser);
    const submit = { mutateAsync: vi.fn().mockResolvedValue(agent), isPending: false };
    vi.mocked(useSubmitAgentKycDocs).mockReturnValue(submit as never);
    renderPage();

    expect(screen.queryByLabelText('Driving licence')).toBeNull();
    expect(screen.queryByText('Licence number')).toBeNull();

    const submitBtn = screen.getByRole('button', { name: /submit for verification/i });
    expect(submitBtn).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Aadhaar â€” front' }));
    fireEvent.click(screen.getByRole('button', { name: 'Aadhaar â€” back' }));
    fireEvent.click(screen.getByRole('button', { name: 'Selfie' }));
    fireEvent.change(screen.getByLabelText(/Aadhaar â€” last 4 digits/i), { target: { value: '1234' } });
    fireEvent.click(screen.getByRole('checkbox'));

    expect(submitBtn).toBeEnabled();
    fireEvent.click(submitBtn);
    await waitFor(() => expect(submit.mutateAsync).toHaveBeenCalledWith({
      agentId: 'a1',
      input: { aadhaarFrontPath: 'path/Aadhaar â€” front', aadhaarBackPath: 'path/Aadhaar â€” back', aadhaarLast4: '1234', selfiePath: 'path/Selfie', consent: true },
    }));
    expect(await screen.findByText('profile page')).toBeInTheDocument();
  });
});
