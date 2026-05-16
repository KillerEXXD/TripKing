import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SectionLabel } from '@/components/ui/SectionLabel';

describe('SectionLabel', () => {
  it('renders its children with uppercase + tracking classes', () => {
    render(<SectionLabel>Payout</SectionLabel>);
    const el = screen.getByText('Payout');
    expect(el.className).toMatch(/uppercase/);
    expect(el.className).toMatch(/tracking-wider/);
  });
});
