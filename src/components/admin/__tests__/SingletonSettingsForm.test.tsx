import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/lib/api/services/admin-stage5');
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
import * as svc from '@/lib/api/services/admin-stage5';
import { SingletonSettingsForm } from '@/components/admin/SingletonSettingsForm';

function Wrap({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => vi.clearAllMocks());

describe('SingletonSettingsForm', () => {
  it('renders one input per field with the current value', async () => {
    vi.mocked(svc.getSingletonSettings).mockResolvedValue({ id: 1, driver_platform_fee_paise: 5000, enabled: true });
    render(<Wrap><SingletonSettingsForm settingsKey="wallet-settings" pinnedFields={['driver_platform_fee_paise']} /></Wrap>);
    await waitFor(() => expect(screen.getByDisplayValue('5000')).toBeInTheDocument());
    expect(screen.getByLabelText(/Enabled/i)).toBeChecked();
  });

  it('PATCHes only changed fields', async () => {
    vi.mocked(svc.getSingletonSettings).mockResolvedValue({ id: 1, driver_platform_fee_paise: 5000, agent_platform_fee_paise: 6000 });
    vi.mocked(svc.updateSingletonSettings).mockResolvedValue({ id: 1, driver_platform_fee_paise: 7500, agent_platform_fee_paise: 6000 });
    render(<Wrap><SingletonSettingsForm settingsKey="wallet-settings" /></Wrap>);
    const input = await screen.findByDisplayValue('5000');
    fireEvent.change(input, { target: { value: '7500' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(svc.updateSingletonSettings).toHaveBeenCalledWith('wallet-settings', { driver_platform_fee_paise: 7500 }));
  });
});
