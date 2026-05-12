import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { VideoCallConsolePage } from '@/pages/administration/VideoCallConsolePage';
import type { VideoVerification } from '@/types';

vi.mock('@/hooks/useVideoVerification', () => ({ useScheduledVideoCalls: vi.fn(), useFinalizeVideoCall: vi.fn(), useMarkVideoCallNoShow: vi.fn() }));
import { useFinalizeVideoCall, useMarkVideoCallNoShow, useScheduledVideoCalls } from '@/hooks/useVideoVerification';
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

function call(over: Partial<VideoVerification> = {}): VideoVerification {
  return {
    id: 'vv-1',
    status: 'scheduled',
    scheduledAt: '2099-06-01T09:00:00Z',
    slotMinutes: 15,
    meetingProvider: 'jitsi',
    meetingUrl: 'https://meet.jit.si/tripking-vv-1',
    faceMatchConfirmed: false,
    documentsConfirmed: false,
    livenessCheckPassed: false,
    driver: { id: 'd1', fullName: 'Ravi Kumar', phone: '+919999999999', kycStatus: 'video_pending', cityName: 'Vellore' },
    ...over,
  } as VideoVerification;
}

type Q = { isPending?: boolean; isError?: boolean; data?: VideoVerification[]; refetch?: () => void };
function setCalls(q: Q = {}) {
  vi.mocked(useScheduledVideoCalls).mockReturnValue({ isPending: false, isError: false, data: [], refetch: vi.fn(), ...q } as never);
}
function setFinalize() {
  const f = { mutateAsync: vi.fn().mockResolvedValue(call()), isPending: false };
  vi.mocked(useFinalizeVideoCall).mockReturnValue(f as never);
  return f;
}
function renderPage() {
  return render(<MemoryRouter><VideoCallConsolePage /></MemoryRouter>);
}

describe('VideoCallConsolePage', () => {
  beforeEach(() => {
    vi.mocked(useScheduledVideoCalls).mockReset();
    vi.mocked(useFinalizeVideoCall).mockReset();
    vi.mocked(useMarkVideoCallNoShow).mockReset();
    setCalls({ data: [] });
    setFinalize();
    vi.mocked(useMarkVideoCallNoShow).mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue(undefined), isPending: false } as never);
  });

  it('shows a loading skeleton, then an error, then an empty state', () => {
    setCalls({ isPending: true });
    const { rerender } = renderPage();
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();

    const refetch = vi.fn();
    setCalls({ isError: true, refetch });
    rerender(<MemoryRouter><VideoCallConsolePage /></MemoryRouter>);
    expect(screen.getByText(/couldn't load video calls/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();

    setCalls({ data: [] });
    rerender(<MemoryRouter><VideoCallConsolePage /></MemoryRouter>);
    expect(screen.getByText(/no video calls match this filter/i)).toBeInTheDocument();
  });

  it('lists a scheduled call and only approves once all three gates are ticked', async () => {
    const finalize = setFinalize();
    setCalls({ data: [call()] });
    renderPage();

    expect(screen.getByText('Ravi Kumar')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /join call/i })).toHaveAttribute('href', 'https://meet.jit.si/tripking-vv-1');

    fireEvent.click(screen.getByRole('button', { name: /run call/i }));
    const approve = screen.getByRole('button', { name: /^approve$/i });
    expect(approve).toBeDisabled();

    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(3);
    checkboxes.forEach((c) => fireEvent.click(c));
    expect(approve).toBeEnabled();

    fireEvent.click(approve);
    expect(finalize.mutateAsync).toHaveBeenCalledWith({
      id: 'vv-1',
      input: { outcome: 'approved', faceMatchConfirmed: true, documentsConfirmed: true, livenessCheckPassed: true, notes: undefined },
    });
  });
});
