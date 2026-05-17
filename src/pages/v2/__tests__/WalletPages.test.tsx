import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('@/hooks/useCashWallet');
import * as wh from '@/hooks/useCashWallet';

import { OperatorWalletPage } from '@/pages/v2/operator-console/WalletPage';
import { FieldWalletPage } from '@/pages/v2/field-companion/WalletPage';
import { PipelineWalletPage } from '@/pages/v2/pipeline-board/WalletPage';
import { EditorialWalletPage } from '@/pages/v2/editorial/WalletPage';
import { BharatWalletPage } from '@/pages/v2/bharat-native/WalletPage';

const WALLET = {
  walletId: 'w1',
  balance: {
    promoPaise: 100000,
    transferredPaise: 50000,
    cashPaise: 25000,
    totalPaise: 175000,
  },
  recentLedger: [],
};

function Wrap({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

function mockWallet() {
  vi.mocked(wh.useCashWallet).mockReturnValue({
    data: WALLET,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof wh.useCashWallet>);
}

beforeEach(() => vi.clearAllMocks());

describe('v2 wallet pages', () => {
  it('Operator: dl rows for each sub-balance + Top up button', () => {
    mockWallet();
    render(<Wrap><OperatorWalletPage /></Wrap>);
    expect(screen.getByText(/Cash \(top-ups\)/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /top up/i })).toBeInTheDocument();
  });

  it('Field: big total hero + sticky Top up CTA', () => {
    mockWallet();
    render(<Wrap><FieldWalletPage /></Wrap>);
    expect(screen.getByText('₹1,750')).toBeInTheDocument(); // total
    expect(screen.getByRole('button', { name: /top up/i })).toBeInTheDocument();
  });

  it('Pipeline: 3 tinted sub-balance cards', () => {
    mockWallet();
    render(<Wrap><PipelineWalletPage /></Wrap>);
    expect(screen.getByLabelText(/sub-balances/i)).toBeInTheDocument();
  });

  it('Editorial: "Your purse" serif heading + 3 italic rows', () => {
    mockWallet();
    render(<Wrap><EditorialWalletPage /></Wrap>);
    expect(screen.getByRole('heading', { name: /your purse/i })).toBeInTheDocument();
  });

  it('Bharat: indigo total header + 3 action tiles', () => {
    mockWallet();
    render(<Wrap><BharatWalletPage /></Wrap>);
    expect(screen.getByText(/மொத்த இருப்பு/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /நிரப்பு/ })).toBeInTheDocument();
  });
});
