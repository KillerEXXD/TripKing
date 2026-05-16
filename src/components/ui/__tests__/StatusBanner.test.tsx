import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBanner } from '@/components/ui/StatusBanner';

describe('StatusBanner', () => {
  it('renders title + children with the right tone classes', () => {
    render(
      <StatusBanner tone="success" title="Applied">
        Waiting for the trip manager.
      </StatusBanner>,
    );
    expect(screen.getByText('Applied')).toBeInTheDocument();
    expect(screen.getByText(/waiting for the trip manager/i)).toBeInTheDocument();
    const role = screen.getByRole('status');
    expect(role.className).toMatch(/bg-emerald-50/);
    expect(role.className).toMatch(/border-emerald-200/);
  });

  it('exposes role="status" for screen readers', () => {
    render(<StatusBanner tone="info" title="x" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('switches palette per tone (smoke test for the TONE map)', () => {
    const { rerender } = render(<StatusBanner tone="success" title="x" />);
    expect(screen.getByRole('status').className).toMatch(/bg-emerald-50/);
    rerender(<StatusBanner tone="warning" title="x" />);
    expect(screen.getByRole('status').className).toMatch(/bg-amber-50/);
    rerender(<StatusBanner tone="danger" title="x" />);
    expect(screen.getByRole('status').className).toMatch(/bg-red-50/);
    rerender(<StatusBanner tone="info" title="x" />);
    expect(screen.getByRole('status').className).toMatch(/bg-blue-50/);
  });
});
