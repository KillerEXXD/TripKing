import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Navigation } from 'lucide-react';
import { PriorityCard } from '@/components/ui/priorityCard';

function withRouter(ui: React.ReactNode) {
  return <MemoryRouter>{ui}</MemoryRouter>;
}

describe('PriorityCard', () => {
  it('renders a Link when `to` is provided — label, title, subtitle, CTA all visible', () => {
    render(
      withRouter(
        <PriorityCard
          to="/trips/abc"
          tone="emerald"
          icon={<Navigation className="size-3.5" aria-hidden />}
          label="Driving now"
          title="Vellore → Chennai"
          subtitle="140 km · ₹2,200 payout"
          cta={{ label: 'Continue' }}
          ariaLabel="Open trip Vellore to Chennai"
        />,
      ),
    );
    const link = screen.getByRole('link', { name: /open trip vellore to chennai/i });
    expect(link).toHaveAttribute('href', '/trips/abc');
    expect(link).toHaveTextContent(/driving now/i);
    expect(link).toHaveTextContent(/vellore → chennai/i);
    expect(link).toHaveTextContent(/140 km · ₹2,200 payout/i);
    expect(link).toHaveTextContent(/continue/i);
  });

  it('renders a clickable button (role=button + Enter/Space keyboard) when `onClick` is provided', () => {
    const onClick = vi.fn();
    render(
      <PriorityCard
        onClick={onClick}
        tone="indigo"
        icon={<Navigation className="size-3.5" aria-hidden />}
        label="Tap me"
        title="An action"
      />,
    );
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(2);
    fireEvent.keyDown(btn, { key: ' ' });
    expect(onClick).toHaveBeenCalledTimes(3);
    // Non-activation keys do nothing.
    fireEvent.keyDown(btn, { key: 'a' });
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('renders a static div (no Link, no button) when neither `to` nor `onClick` is provided', () => {
    render(
      <PriorityCard
        tone="amber"
        icon={<Navigation className="size-3.5" aria-hidden />}
        label="Static card"
        title="Read-only"
      />,
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(/static card/i)).toBeInTheDocument();
  });

  it('applies the right tone-tinted classes (smoke test for the palette map)', () => {
    const { container, rerender } = render(
      withRouter(<PriorityCard to="/" tone="emerald" icon={null} label="x" title="x" />),
    );
    expect(container.firstChild).toHaveClass('border-emerald-300', 'bg-emerald-50');
    rerender(withRouter(<PriorityCard to="/" tone="teal" icon={null} label="x" title="x" />));
    expect(container.firstChild).toHaveClass('border-teal-300', 'bg-teal-50');
    rerender(withRouter(<PriorityCard to="/" tone="blue" icon={null} label="x" title="x" />));
    expect(container.firstChild).toHaveClass('border-blue-300', 'bg-blue-50');
  });

  it('renders rightAction on the right of the header row', () => {
    render(
      withRouter(
        <PriorityCard
          to="/"
          tone="emerald"
          icon={<Navigation className="size-3.5" aria-hidden />}
          label="Driving now"
          title="x"
          rightAction={<span data-testid="countdown">02:30</span>}
        />,
      ),
    );
    expect(screen.getByTestId('countdown')).toHaveTextContent('02:30');
  });

  it('renders footerSlot in place of the pill CTA when provided', () => {
    render(
      withRouter(
        <PriorityCard
          to="/"
          tone="emerald"
          icon={null}
          label="x"
          title="x"
          cta={{ label: 'should-not-render' }}
          footerSlot={<button type="button" data-testid="custom-footer">Accept / Decline</button>}
        />,
      ),
    );
    expect(screen.getByTestId('custom-footer')).toBeInTheDocument();
    expect(screen.queryByText(/should-not-render/i)).toBeNull();
  });

  it('renders children between subtitle and CTA — supports rich bodies (stat grids, etc.)', () => {
    render(
      withRouter(
        <PriorityCard
          to="/"
          tone="emerald"
          icon={null}
          label="x"
          title="x"
          subtitle="sub"
          cta={{ label: 'go' }}
        >
          <div data-testid="rich-body">stat-grid-here</div>
        </PriorityCard>,
      ),
    );
    expect(screen.getByTestId('rich-body')).toBeInTheDocument();
    expect(screen.getByText(/stat-grid-here/)).toBeInTheDocument();
  });
});
