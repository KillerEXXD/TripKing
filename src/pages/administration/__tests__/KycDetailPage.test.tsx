import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { KycDetailPage } from '@/pages/administration/KycDetailPage';

vi.mock('@/hooks/useDrivers', () => ({
  useDriver: vi.fn(),
  useAgent: vi.fn(),
  useUpdateDriverKyc: vi.fn(),
  useUpdateAgentKyc: vi.fn(),
  useDriverKycDocs: vi.fn(),
  useAgentKycDocs: vi.fn(),
}));
vi.mock('@/hooks/useVehicles', () => ({
  useDriverVehicles: vi.fn(),
}));
vi.mock('@/hooks/useVideoVerification', () => ({
  useSetVideoCallStatus: vi.fn(),
}));
import { useAgent, useAgentKycDocs, useDriver, useDriverKycDocs, useUpdateAgentKyc, useUpdateDriverKyc } from '@/hooks/useDrivers';
import { useDriverVehicles } from '@/hooks/useVehicles';
import { useSetVideoCallStatus } from '@/hooks/useVideoVerification';

function mockQueryReturn<T>(data?: T) {
  return { isPending: false, isError: false, data, refetch: vi.fn() } as never;
}
function mockMutation() {
  return { mutate: vi.fn(), mutateAsync: vi.fn(async () => {}), isPending: false } as never;
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/administration/kyc/:kind/:id" element={<KycDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const baseDriver = {
  id: 'd1',
  fullName: 'Ravi',
  phone: '+91 90000 00000',
  email: 'r@x',
  kycStatus: 'docs_submitted' as const,
  profilePhotoUrl: '',
  homeCity: { id: 'c1', name: 'Vellore' },
  verification: {
    kycStatus: 'docs_submitted' as const,
    steps: { details: 'done', documents: 'done', vehicle: 'todo', vehicle_photos: 'todo', video_call: 'todo' },
    stepsDone: 2,
    stepsTotal: 5,
    videoVerification: null,
    kycRejectionReason: null,
  },
};

describe('KycDetailPage', () => {
  beforeEach(() => {
    vi.mocked(useDriver).mockReturnValue(mockQueryReturn(baseDriver) as never);
    vi.mocked(useAgent).mockReturnValue(mockQueryReturn(undefined) as never);
    vi.mocked(useUpdateDriverKyc).mockReturnValue(mockMutation());
    vi.mocked(useUpdateAgentKyc).mockReturnValue(mockMutation());
    vi.mocked(useDriverKycDocs).mockReturnValue(mockQueryReturn({}) as never);
    vi.mocked(useAgentKycDocs).mockReturnValue(mockQueryReturn({}) as never);
    vi.mocked(useDriverVehicles).mockReturnValue(mockQueryReturn([]) as never);
    vi.mocked(useSetVideoCallStatus).mockReturnValue(mockMutation());
  });

  it('renders the 5 driver checklist steps with their statuses', () => {
    renderAt('/administration/kyc/driver/d1');
    expect(screen.getByRole('heading', { name: /ravi/i })).toBeInTheDocument();
    expect(screen.getByText('Your details')).toBeInTheDocument();
    expect(screen.getByText('Identity documents')).toBeInTheDocument();
    expect(screen.getByText('Vehicle')).toBeInTheDocument();
    expect(screen.getByText('Vehicle photos & papers')).toBeInTheDocument();
    expect(screen.getByText('Video verification')).toBeInTheDocument();
  });

  it('Approve is disabled while kyc_status is not ready_for_approval', () => {
    renderAt('/administration/kyc/driver/d1');
    expect(screen.getByRole('button', { name: /^approve$/i })).toBeDisabled();
  });

  it('Approve is enabled when ready_for_approval and calls the mutation', async () => {
    const mut = { mutate: vi.fn(), mutateAsync: vi.fn(async () => {}), isPending: false };
    vi.mocked(useUpdateDriverKyc).mockReturnValue(mut as never);
    vi.mocked(useDriver).mockReturnValue(mockQueryReturn({
      ...baseDriver,
      kycStatus: 'ready_for_approval',
      verification: { ...baseDriver.verification, kycStatus: 'ready_for_approval', stepsDone: 5 },
    }) as never);
    renderAt('/administration/kyc/driver/d1');
    const btn = screen.getByRole('button', { name: /^approve$/i });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(mut.mutateAsync).toHaveBeenCalledWith({ id: 'd1', kycStatus: 'approved', note: undefined });
  });

  it('renders agents with only 3 steps (no vehicle sections)', () => {
    vi.mocked(useAgent).mockReturnValue(mockQueryReturn({
      ...baseDriver,
      id: 'a1',
      businessCity: { id: 'c1', name: 'Chennai' },
      verification: {
        kycStatus: 'docs_submitted' as const,
        steps: { details: 'done', documents: 'done', video_call: 'todo' },
        stepsDone: 2,
        stepsTotal: 3,
        videoVerification: null,
        kycRejectionReason: null,
      },
    }) as never);
    renderAt('/administration/kyc/agent/a1');
    expect(screen.getByText('Identity documents')).toBeInTheDocument();
    expect(screen.queryByText('Vehicle')).not.toBeInTheDocument();
    expect(screen.queryByText('Vehicle photos & papers')).not.toBeInTheDocument();
  });
});
