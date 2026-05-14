import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentIdentity } from '@/components/agent/AgentIdentity';

describe('<AgentIdentity> verified badge', () => {
  it('shows the badge when kycStatus prop is "approved" (Trip.postedByKycStatus path)', () => {
    render(<AgentIdentity handle="X9Y8Z7" name="Priya Ramesh" kycStatus="approved" />);
    expect(screen.getByText('Priya Ramesh')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /verified/i })).toBeInTheDocument();
  });

  it('does NOT show the badge when kycStatus is pending', () => {
    render(<AgentIdentity handle="X9Y8Z7" name="Priya Ramesh" kycStatus="pending" />);
    expect(screen.queryByRole('img', { name: /verified/i })).not.toBeInTheDocument();
  });

  it('does NOT show the badge when no kycStatus is provided (pre-reveal Trip row)', () => {
    render(<AgentIdentity handle="X9Y8Z7" name="Priya Ramesh" />);
    expect(screen.queryByRole('img', { name: /verified/i })).not.toBeInTheDocument();
  });
});
