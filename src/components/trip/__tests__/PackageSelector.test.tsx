import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { PackageSelector, PACKAGE_OPTIONS } from '@/components/trip/PackageSelector';

describe('PackageSelector', () => {
  it('renders the standard hr/km ladder', () => {
    render(<PackageSelector value={null} onChange={() => {}} />);
    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(PACKAGE_OPTIONS.length);
    expect(screen.getByText('8 hr')).toBeInTheDocument();
    expect(screen.getByText('80 km')).toBeInTheDocument();
  });

  it('marks the selected package checked and emits the picked option', () => {
    const onChange = vi.fn();
    render(<PackageSelector value={{ hours: 4, includedKm: 40 }} onChange={onChange} />);
    const eight = screen.getByRole('radio', { name: /8 hr/i });
    expect(eight).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(eight);
    expect(onChange).toHaveBeenCalledWith({ hours: 8, includedKm: 80 });
  });

  it('has no a11y violations', async () => {
    const { container } = render(<PackageSelector value={{ hours: 8, includedKm: 80 }} onChange={() => {}} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
