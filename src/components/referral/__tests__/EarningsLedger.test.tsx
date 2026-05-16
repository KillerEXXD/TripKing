import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { EarningsLedger } from '@/components/referral/EarningsLedger';
import type { ReferralLedgerEntry } from '@/types';

const entries: ReferralLedgerEntry[] = [
  {
    id: 'l1', entryType: 'accrual', amountPaise: 5000, createdAt: '2026-05-10T09:00:00Z',
    tripRoute: { from: 'Vellore', to: 'Chennai' }, paymentSource: 'cash_wallet', feeSide: 'driver', referredUserName: 'Asha',
  },
  {
    id: 'l2', entryType: 'reversal', amountPaise: 5000, createdAt: '2026-05-09T09:00:00Z',
    tripRoute: { from: 'Salem', to: 'Chennai' }, paymentSource: 'promo_credit', feeSide: 'agent', referredUserName: 'Bina',
    note: 'dispute',
  },
];

describe('EarningsLedger', () => {
  it('renders one row per entry with route + amount + label', () => {
    render(<EarningsLedger entries={entries} />);
    expect(screen.getByText('Vellore → Chennai')).toBeInTheDocument();
    expect(screen.getByText('+₹50')).toBeInTheDocument();
    expect(screen.getByText('EARNED')).toBeInTheDocument();
    expect(screen.getByText('REVERSED')).toBeInTheDocument();
  });

  it('marks ineligible payment sources', () => {
    render(<EarningsLedger entries={entries} />);
    expect(screen.getByText(/not eligible/i)).toBeInTheDocument();
  });

  it('shows empty state when there are no entries', () => {
    render(<EarningsLedger entries={[]} />);
    expect(screen.getByText(/No ledger activity yet/i)).toBeInTheDocument();
  });

  it('has no a11y violations', async () => {
    const { container } = render(<EarningsLedger entries={entries} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
