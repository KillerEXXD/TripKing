import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { VerifiedBadge } from '@/components/ui/VerifiedBadge';

describe('<VerifiedBadge>', () => {
  it('renders the default "Verified" label with the emerald tone', () => {
    render(<VerifiedBadge />);
    expect(screen.getByText('Verified')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /verified by tripking kyc/i })).toBeInTheDocument();
  });

  it('accepts a custom label + ariaLabel', () => {
    render(<VerifiedBadge label="ID verified" ariaLabel="Custom label" />);
    expect(screen.getByText('ID verified')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Custom label' })).toBeInTheDocument();
  });

  it('iconOnly hides the label but keeps the aria-label', () => {
    render(<VerifiedBadge iconOnly />);
    expect(screen.queryByText('Verified')).not.toBeInTheDocument();
    expect(screen.getByRole('img', { name: /verified/i })).toBeInTheDocument();
  });

  it('a11y: passes axe on the default form', async () => {
    const { container } = render(<VerifiedBadge />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
