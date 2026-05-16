import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PageShell } from '@/components/layout/PageShell';

describe('PageShell', () => {
  it('renders children inside the centered mobile column', () => {
    render(<PageShell><div data-testid="x">hi</div></PageShell>);
    const child = screen.getByTestId('x');
    const wrapper = child.parentElement!;
    expect(wrapper.className).toMatch(/max-w-md/);
    expect(wrapper.className).toMatch(/mx-auto/);
  });

  it('merges custom className with defaults', () => {
    render(<PageShell className="bg-amber-50"><span data-testid="y" /></PageShell>);
    const wrapper = screen.getByTestId('y').parentElement!;
    expect(wrapper.className).toMatch(/bg-amber-50/);
    expect(wrapper.className).toMatch(/max-w-md/);
  });
});
