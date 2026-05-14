import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DriverIdentity } from '@/components/driver/DriverIdentity';
import type { Driver } from '@/types';

const approved: Driver = {
  id: 'd1', userId: 'u1', displayHandle: 'A1B2C3', fullName: 'Ravi Kumar', phone: '+919000000001',
  profilePhotoUrl: '',
  kycStatus: 'approved', canReportBugs: false,
  ratingAvg: 4.7, ratingCount: 12, totalTripsCompleted: 30,
  topTags: [], managerTopTags: [],
  ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, vehicles: [],
};
const pending: Driver = { ...approved, id: 'd2', kycStatus: 'pending' };

describe('<DriverIdentity> verified badge', () => {
  it('shows the inline Verified badge when kycStatus is approved', () => {
    render(<DriverIdentity driver={approved} />);
    expect(screen.getByText('Ravi Kumar')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /verified/i })).toBeInTheDocument();
  });

  it('does NOT show the badge when kycStatus is not approved', () => {
    render(<DriverIdentity driver={pending} />);
    expect(screen.getByText('Ravi Kumar')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /verified/i })).not.toBeInTheDocument();
  });

  it('does NOT show the badge when given a minimal shape with no kycStatus (DriverSummary / AssignedDriver)', () => {
    render(<DriverIdentity driver={{ id: 'd', userId: 'u', displayHandle: 'X1Y2Z3', ratingAvg: 0, ratingCount: 0, totalTripsCompleted: 0, topTags: [] }} />);
    expect(screen.queryByRole('img', { name: /verified/i })).not.toBeInTheDocument();
  });
});
