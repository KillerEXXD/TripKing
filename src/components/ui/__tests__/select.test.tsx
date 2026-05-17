import { describe, it, expect } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import { Select } from '@/components/ui/select';

describe('Select', () => {
  it('renders children options and fires onChange', () => {
    let v = '';
    const { container } = render(
      <Select aria-label="x" onChange={(e) => (v = e.target.value)}>
        <option value="">Pick…</option>
        <option value="a">Apple</option>
      </Select>,
    );
    const el = container.querySelector('select')!;
    fireEvent.change(el, { target: { value: 'a' } });
    expect(v).toBe('a');
  });

  it('default tone — white background; accent tone — emerald tint with white-on-focus', () => {
    const { container: a } = render(<Select aria-label="a"><option /></Select>);
    const { container: b } = render(<Select aria-label="b" tone="accent"><option /></Select>);
    expect(a.querySelector('select')!.className).toMatch(/bg-background/);
    expect(b.querySelector('select')!.className).toMatch(/bg-emerald-50/);
    expect(b.querySelector('select')!.className).toMatch(/focus-visible:bg-background/);
  });

  it('preserves rounded-control + focus ring across tones', () => {
    const { container } = render(<Select aria-label="x"><option /></Select>);
    expect(container.querySelector('select')!.className).toMatch(/rounded-control/);
    expect(container.querySelector('select')!.className).toMatch(/focus-visible:ring-ring/);
  });
});
