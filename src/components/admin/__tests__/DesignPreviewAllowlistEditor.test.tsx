import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DesignPreviewAllowlistEditor } from '@/components/admin/DesignPreviewAllowlistEditor';

vi.mock('@/hooks/useAdminStage5', () => ({
  useAdminList: vi.fn(),
  useCreateAdminRow: vi.fn(),
  useUpdateAdminRow: vi.fn(),
  useDeleteAdminRow: vi.fn(),
}));
import {
  useAdminList,
  useCreateAdminRow,
  useUpdateAdminRow,
  useDeleteAdminRow,
} from '@/hooks/useAdminStage5';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { toast } from 'sonner';

function setup(rows: Array<{ id: string; phone: string; note: string | null; is_active: boolean }>) {
  vi.mocked(useAdminList).mockReturnValue({ data: rows, isPending: false, isError: false, refetch: vi.fn() } as never);
  const createMutate = vi.fn().mockResolvedValue(undefined);
  const updateMutate = vi.fn().mockResolvedValue(undefined);
  const removeMutate = vi.fn().mockResolvedValue(undefined);
  vi.mocked(useCreateAdminRow).mockReturnValue({ mutateAsync: createMutate, isPending: false } as never);
  vi.mocked(useUpdateAdminRow).mockReturnValue({ mutateAsync: updateMutate, isPending: false } as never);
  vi.mocked(useDeleteAdminRow).mockReturnValue({ mutateAsync: removeMutate, isPending: false } as never);
  return { createMutate, updateMutate, removeMutate };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DesignPreviewAllowlistEditor', () => {
  it('displays a stored +91 phone as 10 digits without the prefix', () => {
    setup([{ id: 'r1', phone: '+919012345678', note: 'Priya', is_active: true }]);
    render(<DesignPreviewAllowlistEditor />);
    expect(screen.getByText('9012345678')).toBeInTheDocument();
    expect(screen.queryByText('+919012345678')).toBeNull();
  });

  it('renders is_active as Yes / No, not true / false', () => {
    setup([
      { id: 'r1', phone: '+919012345678', note: null, is_active: true },
      { id: 'r2', phone: '+919012345679', note: null, is_active: false },
    ]);
    render(<DesignPreviewAllowlistEditor />);
    // Two rows: one Active → "Yes", one Inactive → "No". The cells render the literal
    // strings (with a select-option duplicate inside the Add card). getAllByText covers both.
    const yes = screen.getAllByText('Yes');
    const no = screen.getAllByText('No');
    expect(yes.length).toBeGreaterThan(0);
    expect(no.length).toBeGreaterThan(0);
  });

  it('strips non-digit characters from the Add-phone input and caps at 10', () => {
    setup([]);
    render(<DesignPreviewAllowlistEditor />);
    const input = screen.getByPlaceholderText('9012345678') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '+91 9012-345-678901' } });
    expect(input.value).toBe('9012345678'); // digits-only, max 10
  });

  it('disables the Add button until exactly 10 digits are entered', () => {
    setup([]);
    render(<DesignPreviewAllowlistEditor />);
    const input = screen.getByPlaceholderText('9012345678') as HTMLInputElement;
    const addBtn = screen.getByRole('button', { name: /^add$/i });
    expect(addBtn).toBeDisabled();
    fireEvent.change(input, { target: { value: '901234567' } }); // 9 digits
    expect(addBtn).toBeDisabled();
    fireEvent.change(input, { target: { value: '9012345678' } });
    expect(addBtn).toBeEnabled();
  });

  it('normalises a 10-digit input to +91XXXXXXXXXX before sending to the API', async () => {
    const { createMutate } = setup([]);
    render(<DesignPreviewAllowlistEditor />);
    fireEvent.change(screen.getByPlaceholderText('9012345678'), { target: { value: '9012345678' } });
    fireEvent.change(screen.getByPlaceholderText(/priya/i), { target: { value: 'Priya — design lead' } });
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }));
    await waitFor(() => expect(createMutate).toHaveBeenCalledTimes(1));
    expect(createMutate).toHaveBeenCalledWith({
      phone: '+919012345678',
      note: 'Priya — design lead',
      is_active: true,
    });
  });

  it('defaults the Active dropdown to Yes on a new row', () => {
    setup([]);
    render(<DesignPreviewAllowlistEditor />);
    // The two Active selects (table-row edit + add card) both default to Yes.
    const select = screen.getAllByLabelText(/active/i).find((el) => el.tagName === 'SELECT') as HTMLSelectElement | undefined;
    expect(select?.value).toBe('yes');
  });

  it('does NOT render a Sort order column or input', () => {
    setup([{ id: 'r1', phone: '+919012345678', note: null, is_active: true }]);
    render(<DesignPreviewAllowlistEditor />);
    expect(screen.queryByText(/sort order/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/sort/i)).toBeNull();
  });

  it('refuses to save an edit with fewer than 10 digits and toasts an error', async () => {
    const { updateMutate } = setup([{ id: 'r1', phone: '+919012345678', note: null, is_active: true }]);
    render(<DesignPreviewAllowlistEditor />);
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }));
    const editInput = screen.getByLabelText(/phone \(10 digits\)/i) as HTMLInputElement;
    fireEvent.change(editInput, { target: { value: '12345' } });
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/10 digits/i)));
    expect(updateMutate).not.toHaveBeenCalled();
  });
});
