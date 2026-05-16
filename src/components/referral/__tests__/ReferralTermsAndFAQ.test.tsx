import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReferralTermsAndFAQ } from '@/components/referral/ReferralTermsAndFAQ';

describe('ReferralTermsAndFAQ', () => {
  it('starts collapsed and reveals terms when expanded', () => {
    render(<ReferralTermsAndFAQ />);
    expect(screen.queryByText(/Referral rewards are not paid for signup alone/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Referral terms/i }));
    expect(screen.getByText(/Referral rewards are not paid for signup alone/)).toBeInTheDocument();
  });

  it('FAQ section reveals questions when expanded', () => {
    render(<ReferralTermsAndFAQ />);
    fireEvent.click(screen.getByRole('button', { name: /Frequently asked questions/i }));
    expect(screen.getByText(/How do I invite someone\?/)).toBeInTheDocument();
    expect(screen.getByText(/Pending vs released\?/)).toBeInTheDocument();
  });

  it('toggle is keyboard-accessible (aria-expanded flips)', () => {
    render(<ReferralTermsAndFAQ />);
    const btn = screen.getByRole('button', { name: /Referral terms/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });
});
