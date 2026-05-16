import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { InsufficientBalanceModal } from '@/components/wallet/InsufficientBalanceModal';

function Wrap({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

describe('InsufficientBalanceModal', () => {
  it('renders driver-side copy + topup link', () => {
    render(<Wrap><InsufficientBalanceModal side="driver" onClose={() => undefined} /></Wrap>);
    expect(screen.getByText(/Driver wallet is short/i)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /top up my wallet/i });
    expect(link).toHaveAttribute('href', '/wallet');
  });

  it('renders agent-side copy', () => {
    render(<Wrap><InsufficientBalanceModal side="agent" onClose={() => undefined} /></Wrap>);
    expect(screen.getByText(/Agent wallet is short/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open my wallet/i })).toBeInTheDocument();
  });

  it('uses the passed-in message override', () => {
    render(<Wrap><InsufficientBalanceModal side="driver" message="Custom blurb" onClose={() => undefined} /></Wrap>);
    expect(screen.getByText('Custom blurb')).toBeInTheDocument();
  });

  it('calls onClose when Dismiss is tapped', () => {
    const onClose = vi.fn();
    render(<Wrap><InsufficientBalanceModal side="driver" onClose={onClose} /></Wrap>);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(onClose).toHaveBeenCalled();
  });
});
