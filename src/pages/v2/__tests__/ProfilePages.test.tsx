import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const logout = vi.fn();
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1-aaaaaaaa-bbbb', role: 'driver', displayName: 'Karthik Murugan', phone: '+919876543210' },
    isAuthenticated: true,
    isLoading: false,
    logout,
  }),
}));

import { OperatorProfilePage } from '@/pages/v2/operator-console/ProfilePage';
import { FieldProfilePage } from '@/pages/v2/field-companion/ProfilePage';
import { PipelineProfilePage } from '@/pages/v2/pipeline-board/ProfilePage';
import { EditorialProfilePage } from '@/pages/v2/editorial/ProfilePage';
import { BharatProfilePage } from '@/pages/v2/bharat-native/ProfilePage';

function Wrap({ children }: { children: React.ReactNode }) {
  return <MemoryRouter>{children}</MemoryRouter>;
}

beforeEach(() => {
  logout.mockReset();
});

describe('v2 profile pages', () => {
  it('Operator: dense dl rows + Sign out wired to logout', () => {
    render(<Wrap><OperatorProfilePage /></Wrap>);
    expect(screen.getByText(/Display name/i)).toBeInTheDocument();
    expect(screen.getByText(/Karthik Murugan/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(logout).toHaveBeenCalled();
  });

  it('Field: avatar hero + sticky destructive sign-out', () => {
    render(<Wrap><FieldProfilePage /></Wrap>);
    expect(screen.getByRole('heading', { name: /you/i })).toBeInTheDocument();
    expect(screen.getByText(/Karthik Murugan/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(logout).toHaveBeenCalled();
  });

  it('Pipeline: account card + 2 link cards + sign-out', () => {
    render(<Wrap><PipelineProfilePage /></Wrap>);
    expect(screen.getByText(/Signed in as/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open the board/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(logout).toHaveBeenCalled();
  });

  it('Editorial: about-the-contributor masthead + italic sign-out', () => {
    render(<Wrap><EditorialProfilePage /></Wrap>);
    expect(screen.getByText(/about the contributor/i)).toBeInTheDocument();
    expect(screen.getByText(/karthik murugan/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /sign out of the journal/i }));
    expect(logout).toHaveBeenCalled();
  });

  it('Bharat: indigo avatar header + bilingual sign-out', () => {
    render(<Wrap><BharatProfilePage /></Wrap>);
    expect(screen.getByText(/Karthik Murugan/)).toBeInTheDocument();
    expect(screen.getByText(/தொலைபேசி/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /வெளியேறு/ }));
    expect(logout).toHaveBeenCalled();
  });
});
