import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@/test/test-utils';
import { renderWithProviders } from '@/test/test-utils';
import { EmptyState } from '../EmptyState';
import { ErrorState } from '../ErrorState';
import { LoadingSkeleton } from '../LoadingSkeleton';

describe('EmptyState', () => {
  it('renders the title and message', () => {
    renderWithProviders(<EmptyState title="No open trips" message="Check back soon" />);
    expect(screen.getByText('No open trips')).toBeInTheDocument();
    expect(screen.getByText('Check back soon')).toBeInTheDocument();
  });
});

describe('ErrorState', () => {
  it('shows a retry button that calls onRetry', () => {
    const onRetry = vi.fn();
    renderWithProviders(<ErrorState title="Couldn't load trips" onRetry={onRetry} />);
    expect(screen.getByText("Couldn't load trips")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
  it('omits the retry button when no handler is given', () => {
    renderWithProviders(<ErrorState />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});

describe('LoadingSkeleton', () => {
  it('renders the requested number of placeholder rows + a status role', () => {
    const { container } = renderWithProviders(<LoadingSkeleton rows={5} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(container.querySelectorAll('.animate-pulse')).toHaveLength(5);
  });
});
