import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StickyFooterCTA } from '@/components/ui/StickyFooterCTA';

describe('StickyFooterCTA', () => {
  it('renders children inside a fixed-bottom band', () => {
    render(<StickyFooterCTA><button>Continue</button></StickyFooterCTA>);
    const btn = screen.getByRole('button', { name: 'Continue' });
    const outer = btn.closest('.fixed');
    expect(outer?.className).toMatch(/bottom-0/);
    expect(outer?.className).toMatch(/shadow-footer/);
  });
});
