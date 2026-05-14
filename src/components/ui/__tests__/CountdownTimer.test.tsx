import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { CountdownTimer } from '@/components/ui/CountdownTimer';

describe('<CountdownTimer>', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-05-14T10:00:00Z')); });
  afterEach(() => { vi.useRealTimers(); });

  it('renders nothing when deadline is missing', () => {
    const { container } = render(<CountdownTimer deadline={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the remaining time and ticks down every second', () => {
    // 90 seconds from now → "1:30"
    render(<CountdownTimer deadline="2026-05-14T10:01:30Z" />);
    expect(screen.getByText('1:30')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1_000); });
    expect(screen.getByText('1:29')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(10_000); });
    expect(screen.getByText('1:19')).toBeInTheDocument();
  });

  it('renders the expired label once the deadline has passed', () => {
    render(<CountdownTimer deadline="2026-05-14T10:00:00Z" expiredLabel="Expired — try again" />);
    expect(screen.getByText('Expired — try again')).toBeInTheDocument();
  });

  it('renders the prefix when supplied', () => {
    render(<CountdownTimer deadline="2026-05-14T10:01:00Z" prefix="Accept within" />);
    expect(screen.getByText(/Accept within/i)).toBeInTheDocument();
    expect(screen.getByText('1:00')).toBeInTheDocument();
  });
});
