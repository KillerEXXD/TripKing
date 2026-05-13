import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { HomePage } from '@/pages/HomePage';
import type { User } from '@/types';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('@/hooks/useNotifications', () => ({ useUnreadNotificationCount: () => 0 }));
import { useAuth } from '@/contexts/AuthContext';

const admin: User = { id: 'x', role: 'admin', phone: '+919840492777', displayName: 'Ravee Sundar', preferredLanguage: 'en', isActive: true };

function renderHome() {
  vi.mocked(useAuth).mockReturnValue({ user: admin, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() });
  return render(<MemoryRouter><HomePage /></MemoryRouter>);
}

describe('HomePage (admin home)', () => {
  beforeEach(() => vi.mocked(useAuth).mockReset());

  it('greets the admin', () => {
    renderHome();
    expect(screen.getByText('Ravee Sundar')).toBeInTheDocument();
    expect(screen.getByText(/^admin$/i)).toBeInTheDocument();
  });

  it('shows a tile for every /administration area, linking to it', () => {
    renderHome();
    const expected: [RegExp, string][] = [
      [/reference data/i, '/administration/config'],
      [/kyc review queue/i, '/administration/kyc'],
      [/reviews moderation/i, '/administration/reviews'],
      [/translation manager/i, '/administration/translations'],
      [/search by name, phone, city/i, '/administration/drivers'],
      [/search by name, phone, business/i, '/administration/agents'],
      [/search by name, phone, alias/i, '/administration/passengers'],
      [/filter by eligibility and expiry/i, '/administration/vehicles'],
    ];
    for (const [name, href] of expected) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('href', href);
    }
  });

  it('keeps marketplace shortcuts and a link to the full administration page', () => {
    renderHome();
    expect(screen.getByRole('link', { name: /browse trips/i })).toHaveAttribute('href', '/trips');
    expect(screen.getByRole('link', { name: /full administration page/i })).toHaveAttribute('href', '/administration');
  });
});
