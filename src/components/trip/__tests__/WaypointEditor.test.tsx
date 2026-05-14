import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WaypointEditor, emptyWaypoint, type WaypointDraft } from '@/components/trip/WaypointEditor';

const cities = [
  { id: 'c-vlr', name: 'Vellore', state: 'TN', lat: 12.9, lng: 79.1, sortOrder: 1, isActive: true },
  { id: 'c-chn', name: 'Chennai', state: 'TN', lat: 13.0, lng: 80.2, sortOrder: 2, isActive: true },
  { id: 'c-trc', name: 'Trichy', state: 'TN', lat: 10.8, lng: 78.7, sortOrder: 3, isActive: true },
];

function row(over: Partial<WaypointDraft> = {}): WaypointDraft {
  return { uid: 'wp-1', cityId: 'c-vlr', arriveAt: '', waitMinutes: 0, notes: '', ...over };
}

describe('emptyWaypoint', () => {
  it('returns a fresh draft with a unique uid + empty fields each call', () => {
    const a = emptyWaypoint();
    const b = emptyWaypoint();
    expect(a.uid).toMatch(/^wp-[a-z0-9]{1,8}$/);
    expect(b.uid).not.toBe(a.uid);
    expect(a).toMatchObject({ cityId: '', arriveAt: '', waitMinutes: 0, notes: '' });
  });
});

describe('<WaypointEditor>', () => {
  it('renders the empty-state hint + add button when value is []', () => {
    const onChange = vi.fn();
    render(<WaypointEditor value={[]} onChange={onChange} cities={cities} />);
    expect(screen.getByText(/No destinations yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add destination/i })).toBeInTheDocument();
  });

  it('honours rowLabel + addLabel overrides', () => {
    render(
      <WaypointEditor
        value={[row()]}
        onChange={vi.fn()}
        cities={cities}
        rowLabel="Stop"
        addLabel="Add another stop"
      />,
    );
    expect(screen.getByText(/Stop 1/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add another stop/i })).toBeInTheDocument();
  });

  it('appends a new (empty) row when the add button is clicked', () => {
    const onChange = vi.fn();
    render(<WaypointEditor value={[]} onChange={onChange} cities={cities} />);
    fireEvent.click(screen.getByRole('button', { name: /add destination/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]?.[0] as WaypointDraft[];
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ cityId: '', arriveAt: '', waitMinutes: 0, notes: '' });
  });

  it('updates the city when a row\'s select changes', () => {
    const onChange = vi.fn();
    render(<WaypointEditor value={[row()]} onChange={onChange} cities={cities} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'c-chn' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect((onChange.mock.calls[0]?.[0] as WaypointDraft[])[0]?.cityId).toBe('c-chn');
  });

  it('updates waitMinutes (numeric, clamped at 0) when the field changes', () => {
    const onChange = vi.fn();
    render(<WaypointEditor value={[row({ waitMinutes: 30 })]} onChange={onChange} cities={cities} />);
    const wait = screen.getByRole('spinbutton', { name: /wait \(minutes\)/i });
    fireEvent.change(wait, { target: { value: '60' } });
    expect((onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as WaypointDraft[])[0]?.waitMinutes).toBe(60);
    // negative is clamped to 0
    fireEvent.change(wait, { target: { value: '-5' } });
    expect((onChange.mock.calls[onChange.mock.calls.length - 1]?.[0] as WaypointDraft[])[0]?.waitMinutes).toBe(0);
  });

  it('removes a row via the trash button', () => {
    const onChange = vi.fn();
    const rows: WaypointDraft[] = [row({ uid: 'wp-a' }), row({ uid: 'wp-b', cityId: 'c-chn' })];
    render(<WaypointEditor value={rows} onChange={onChange} cities={cities} />);
    fireEvent.click(screen.getByRole('button', { name: /remove destination 1/i }));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0]?.[0] as WaypointDraft[];
    expect(next).toHaveLength(1);
    expect(next[0]?.uid).toBe('wp-b');
  });

  it('refuses to remove below minRows', () => {
    const onChange = vi.fn();
    render(<WaypointEditor value={[row()]} onChange={onChange} cities={cities} minRows={1} />);
    const trash = screen.getByRole('button', { name: /remove destination 1/i });
    expect(trash).toBeDisabled();
    fireEvent.click(trash);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reorders via the up/down arrows', () => {
    const onChange = vi.fn();
    const rows: WaypointDraft[] = [
      row({ uid: 'wp-a', cityId: 'c-vlr' }),
      row({ uid: 'wp-b', cityId: 'c-chn' }),
      row({ uid: 'wp-c', cityId: 'c-trc' }),
    ];
    render(<WaypointEditor value={rows} onChange={onChange} cities={cities} />);
    fireEvent.click(screen.getByRole('button', { name: /move destination 2 up/i }));
    const next = onChange.mock.calls[0]?.[0] as WaypointDraft[];
    expect(next.map((r) => r.uid)).toEqual(['wp-b', 'wp-a', 'wp-c']);

    onChange.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /move destination 2 down/i }));
    const next2 = onChange.mock.calls[0]?.[0] as WaypointDraft[];
    expect(next2.map((r) => r.uid)).toEqual(['wp-a', 'wp-c', 'wp-b']);
  });

  it('disables ↑ on the first row and ↓ on the last row', () => {
    render(<WaypointEditor value={[row({ uid: 'wp-a' }), row({ uid: 'wp-b' })]} onChange={vi.fn()} cities={cities} />);
    expect(screen.getByRole('button', { name: /move destination 1 up/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /move destination 2 down/i })).toBeDisabled();
  });
});
