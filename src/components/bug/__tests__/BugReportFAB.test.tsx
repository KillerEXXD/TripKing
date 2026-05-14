import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { BugReportFAB } from '@/components/bug/BugReportFAB';
import type { User } from '@/types';

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));
import { useAuth } from '@/contexts/AuthContext';

function Wrap({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const baseUser: User = {
  id: 'u', role: 'driver', phone: '+91', displayName: 'D', preferredLanguage: 'en', isActive: true, canReportBugs: false,
};

describe('BugReportFAB — gate matrix', () => {
  it('renders nothing for an anonymous user', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, isAuthenticated: false } as never);
    const { container } = render(<Wrap><BugReportFAB /></Wrap>);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a signed-in user without canReportBugs', () => {
    vi.mocked(useAuth).mockReturnValue({ user: baseUser, isAuthenticated: true } as never);
    render(<Wrap><BugReportFAB /></Wrap>);
    expect(screen.queryByRole('button', { name: /report a bug/i })).toBeNull();
  });

  it('renders the FAB for a user with canReportBugs=true', () => {
    vi.mocked(useAuth).mockReturnValue({ user: { ...baseUser, canReportBugs: true }, isAuthenticated: true } as never);
    render(<Wrap><BugReportFAB /></Wrap>);
    expect(screen.getByRole('button', { name: /report a bug/i })).toBeInTheDocument();
  });

  it('renders the FAB for any admin, even if canReportBugs=false', () => {
    vi.mocked(useAuth).mockReturnValue({ user: { ...baseUser, role: 'admin', canReportBugs: false }, isAuthenticated: true } as never);
    render(<Wrap><BugReportFAB /></Wrap>);
    expect(screen.getByRole('button', { name: /report a bug/i })).toBeInTheDocument();
  });
});
