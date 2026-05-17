import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Input } from '@/components/ui/input';

describe('Input', () => {
  it('default tone — white background', () => {
    const { container } = render(<Input placeholder="x" />);
    const el = container.querySelector('input')!;
    expect(el.className).toMatch(/bg-background/);
    expect(el.className).not.toMatch(/bg-emerald-50/);
  });

  it('accent tone — emerald-50 tint, white on focus', () => {
    const { container } = render(<Input placeholder="x" tone="accent" />);
    const el = container.querySelector('input')!;
    expect(el.className).toMatch(/bg-emerald-50/);
    expect(el.className).toMatch(/focus-visible:bg-background/);
  });

  it('preserves rounded-control + focus ring across tones', () => {
    const { container: a } = render(<Input />);
    const { container: b } = render(<Input tone="accent" />);
    for (const c of [a, b]) {
      const el = c.querySelector('input')!;
      expect(el.className).toMatch(/rounded-control/);
      expect(el.className).toMatch(/focus-visible:ring-ring/);
    }
  });
});
