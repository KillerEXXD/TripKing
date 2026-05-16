import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressBar } from '@/components/ui/ProgressBar';

describe('ProgressBar', () => {
  it('exposes ARIA progressbar semantics', () => {
    render(<ProgressBar value={2} max={5} />);
    const bar = screen.getByRole('progressbar');
    expect(bar).toHaveAttribute('aria-valuenow', '2');
    expect(bar).toHaveAttribute('aria-valuemax', '5');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
  });

  it('clamps value to [0, max]', () => {
    const { rerender } = render(<ProgressBar value={-3} max={10} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    rerender(<ProgressBar value={99} max={10} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '10');
  });

  it('uses the supplied aria-label, falling back to Step X of Y', () => {
    const { rerender } = render(<ProgressBar value={1} max={3} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-label', 'Step 1 of 3');
    rerender(<ProgressBar value={1} max={3} ariaLabel="Onboarding progress" />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-label', 'Onboarding progress');
  });
});
