import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { useState } from 'react';
import { DateTimeField } from '@/components/form/DateTimeField';

function Harness({ initial = '', onChange }: { initial?: string; onChange?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <DateTimeField
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
    />
  );
}

describe('DateTimeField', () => {
  it('renders placeholder when empty', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: /pick date & time/i })).toBeInTheDocument();
  });

  it('formats an initial value on the trigger', () => {
    render(<Harness initial="2026-06-15T14:30" />);
    expect(screen.getByRole('button')).toHaveTextContent(/Jun.*15.*2026.*02:30 PM/);
  });

  it('OK commits the draft and closes the popover', () => {
    const onChange = vi.fn();
    render(<Harness initial="2026-06-15T14:30" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button'));

    const hourList = screen.getByRole('listbox', { name: /hour/i });
    fireEvent.click(within(hourList).getByRole('option', { name: '09' }));
    const minuteList = screen.getByRole('listbox', { name: /minute/i });
    fireEvent.click(within(minuteList).getByRole('option', { name: '45' }));
    fireEvent.click(screen.getByRole('radio', { name: 'AM' }));

    fireEvent.click(screen.getByRole('button', { name: /confirm date and time/i }));
    expect(onChange).toHaveBeenLastCalledWith('2026-06-15T09:45');
  });

  it('Clear empties the value', () => {
    const onChange = vi.fn();
    render(<Harness initial="2026-06-15T14:30" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button'));
    fireEvent.click(screen.getByRole('button', { name: /^clear$/i }));
    expect(onChange).toHaveBeenLastCalledWith('');
  });

  it('does not commit when popover closes without OK', () => {
    const onChange = vi.fn();
    render(<Harness initial="2026-06-15T14:30" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button'));
    const hourList = screen.getByRole('listbox', { name: /hour/i });
    fireEvent.click(within(hourList).getByRole('option', { name: '09' }));
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(onChange).not.toHaveBeenCalled();
  });
});
