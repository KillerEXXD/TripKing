import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TranslationManagerPage } from '@/pages/administration/TranslationManagerPage';
import type { LanguageRow } from '@/types';

vi.mock('@/hooks/useAdminConfig', () => ({ languageHooks: { useList: vi.fn(), useCreate: vi.fn(), useToggleActive: vi.fn(), useRemove: vi.fn() } }));
import { languageHooks } from '@/hooks/useAdminConfig';
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function makeLang(over: Partial<LanguageRow> = {}): LanguageRow {
  return { code: 'ta', nativeName: 'தமிழ்', englishName: 'Tamil', displayOrder: 2, isActive: true, ...over };
}

type ListState = { isPending?: boolean; isError?: boolean; data?: LanguageRow[]; refetch?: () => void };
function setList(s: ListState = {}) {
  vi.mocked(languageHooks.useList).mockReturnValue({ isPending: false, isError: false, data: [], refetch: vi.fn(), ...s } as never);
}
function setMutations() {
  const create = { mutate: vi.fn(), isPending: false };
  const toggle = { mutate: vi.fn(), isPending: false };
  const remove = { mutate: vi.fn(), isPending: false };
  vi.mocked(languageHooks.useCreate).mockReturnValue(create as never);
  vi.mocked(languageHooks.useToggleActive).mockReturnValue(toggle as never);
  vi.mocked(languageHooks.useRemove).mockReturnValue(remove as never);
  return { create, toggle, remove };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <TranslationManagerPage />
    </MemoryRouter>,
  );
}

describe('TranslationManagerPage', () => {
  beforeEach(() => {
    vi.mocked(languageHooks.useList).mockReset();
    vi.mocked(languageHooks.useCreate).mockReset();
    vi.mocked(languageHooks.useToggleActive).mockReset();
    vi.mocked(languageHooks.useRemove).mockReset();
    setList({ data: [] });
    setMutations();
  });

  it('shows a skeleton while languages load', () => {
    setList({ isPending: true });
    renderPage();
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('shows an error state with retry on failure', () => {
    const refetch = vi.fn();
    setList({ isError: true, refetch });
    renderPage();
    expect(screen.getByText(/couldn't load languages/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows an empty state when there are no languages', () => {
    setList({ data: [] });
    renderPage();
    expect(screen.getByText(/no languages yet/i)).toBeInTheDocument();
  });

  it('lists languages and lets the admin toggle / remove one', () => {
    const { toggle, remove } = setMutations();
    setList({ data: [makeLang()] });
    renderPage();
    expect(screen.getByText('Tamil')).toBeInTheDocument();
    expect(screen.getByText('தமிழ்')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(toggle.mutate).toHaveBeenCalledWith({ id: 'ta', isActive: false });
    fireEvent.click(screen.getByRole('button', { name: /remove tamil/i }));
    expect(remove.mutate).toHaveBeenCalledWith('ta');
  });

  it('adds a language with the entered code and names', () => {
    const { create } = setMutations();
    setList({ data: [] });
    renderPage();
    fireEvent.change(screen.getByLabelText(/locale code/i), { target: { value: 'HI' } });
    fireEvent.change(screen.getByLabelText(/english name/i), { target: { value: 'Hindi' } });
    fireEvent.click(screen.getByRole('button', { name: /add language/i }));
    expect(create.mutate).toHaveBeenCalledWith({ code: 'hi', nativeName: 'Hindi', englishName: 'Hindi' }, expect.anything());
  });
});
