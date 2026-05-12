import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InstallAppCard } from '@/components/layout/InstallAppCard';
import type { UsePwaInstallReturn } from '@/hooks/usePwaInstall';

vi.mock('@/hooks/usePwaInstall', () => ({ usePwaInstall: vi.fn() }));
import { usePwaInstall } from '@/hooks/usePwaInstall';
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { toast } from 'sonner';

function setPwa(over: Partial<UsePwaInstallReturn> = {}) {
  vi.mocked(usePwaInstall).mockReturnValue({ installed: false, canPrompt: false, platform: 'desktop', promptInstall: vi.fn().mockResolvedValue('unavailable'), ...over });
}

describe('InstallAppCard', () => {
  beforeEach(() => {
    vi.mocked(usePwaInstall).mockReset();
    vi.mocked(toast.success).mockClear();
  });

  it('renders nothing when the app is already installed', () => {
    setPwa({ installed: true });
    const { container } = render(<InstallAppCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the native Install button when a prompt is available; clicking it prompts + toasts', async () => {
    const promptInstall = vi.fn().mockResolvedValue('accepted');
    setPwa({ canPrompt: true, promptInstall });
    render(<InstallAppCard />);
    fireEvent.click(screen.getByRole('button', { name: /install app/i }));
    await waitFor(() => expect(promptInstall).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalled();
  });

  it('shows the iOS Share → Add to Home Screen instructions on iOS (no install button)', () => {
    setPwa({ platform: 'ios' });
    render(<InstallAppCard />);
    expect(screen.getByText(/in safari/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /install app/i })).toBeNull();
  });

  it('shows a desktop hint when there is no prompt and the platform is not iOS/Android', () => {
    setPwa({ platform: 'desktop' });
    render(<InstallAppCard />);
    expect(screen.getByText(/install icon/i)).toBeInTheDocument();
  });

  it('the dismiss button hides the card when dismissable', () => {
    setPwa({ platform: 'desktop' });
    render(<InstallAppCard dismissable />);
    expect(screen.getByText('Install TripKing')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByText('Install TripKing')).toBeNull();
  });

  it('has no dismiss button when not dismissable', () => {
    setPwa({ platform: 'desktop' });
    render(<InstallAppCard />);
    expect(screen.queryByRole('button', { name: /dismiss/i })).toBeNull();
  });
});
