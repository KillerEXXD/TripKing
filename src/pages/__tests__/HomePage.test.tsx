import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { axe } from 'vitest-axe';
import { HomePage } from '@/pages/HomePage';
import type { User } from '@/types';

vi.mock('@/contexts/AuthContext', () => ({ useAuth: vi.fn() }));
vi.mock('@/hooks/useNotifications', () => ({ useUnreadNotificationCount: () => 0 }));
import { useAuth } from '@/contexts/AuthContext';

const admin: User = { id: 'x', role: 'admin', phone: '+919840492777', displayName: 'Ravee Sundar', preferredLanguage: 'en', isActive: true, canReportBugs: false };

function renderHome() {
  vi.mocked(useAuth).mockReturnValue({ user: admin, isAuthenticated: true, isLoading: false, requestOtp: vi.fn(), verifyOtp: vi.fn(), logout: vi.fn() });
  return render(<MemoryRouter><HomePage /></MemoryRouter>);
}

describe('HomePage (admin home)', () => {
  beforeEach(() => vi.mocked(useAuth).mockReset());

  it('greets the admin', () => {
    renderHome();
    // Header uses getFirstName() ("Ravee Sundar" -> "Ravee S") and a compact
    // role badge circle ("Ad" with title="Admin") to fit greeting + controls
    // on one row at iPhone widths.
    expect(screen.getByText('Ravee S')).toBeInTheDocument();
    expect(screen.getByLabelText('Admin')).toBeInTheDocument();
  });

  it('shows a tile for every /administration area, linking to it (parity with AdministrationPage)', () => {
    renderHome();
    const expected: [RegExp, string][] = [
      [/platform dashboard/i, '/app/administration/dashboard'],
      [/reference data/i, '/app/administration/config'],
      [/kyc review queue/i, '/app/administration/kyc'],
      [/search by name, phone, city/i, '/app/administration/drivers'],
      [/search by name, phone, business/i, '/app/administration/agents'],
      [/search by name, phone, alias/i, '/app/administration/passengers'],
      [/video call console/i, '/app/administration/video-calls'],
      [/filter by eligibility and expiry/i, '/app/administration/vehicles'],
      [/reviews moderation/i, '/app/administration/reviews'],
      [/translation manager/i, '/app/administration/translations'],
      [/bug tracker/i, '/app/administration/bugs'],
      [/design previews/i, '/app/administration/designs'],
    ];
    for (const [name, href] of expected) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('href', href);
    }
  });

  it('keeps marketplace shortcuts and a link to the full administration page', () => {
    renderHome();
    expect(screen.getByRole('link', { name: /browse trips/i })).toHaveAttribute('href', '/app/trips');
    expect(screen.getByRole('link', { name: /full administration page/i })).toHaveAttribute('href', '/app/administration');
  });

  it('has a top-right profile avatar linking to /profile (consistent across roles)', () => {
    renderHome();
    const avatar = screen.getByRole('link', { name: /your profile/i });
    expect(avatar).toHaveAttribute('href', '/app/profile');
    expect(avatar).toHaveTextContent('RS'); // initials of "Ravee Sundar"
  });

  it('a11y: admin home has no axe violations', async () => {
    const { container } = renderHome();
    expect(await axe(container)).toHaveNoViolations();
  });
});
