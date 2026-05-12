import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReviewModerationPage } from '@/pages/administration/ReviewModerationPage';
import type { Review } from '@/types';

vi.mock('@/hooks/useReviews', () => ({ useFlaggedReviews: vi.fn(), useModerateReview: vi.fn() }));
import { useFlaggedReviews, useModerateReview } from '@/hooks/useReviews';
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function makeReview(over: Partial<Review> = {}): Review {
  return {
    id: 'r1',
    tripId: 'trip-aaaaaaaa-bbbb',
    raterUserId: 'u9',
    raterRole: 'passenger',
    rateeUserId: 'u1',
    direction: 'passenger_to_driver',
    score: 1,
    comment: 'Spammy nonsense.',
    tagIds: [],
    isPublished: true,
    isFlagged: true,
    flagReason: 'spam',
    createdAt: '2099-01-01T00:00:00Z',
    ...over,
  };
}

type FState = { isPending?: boolean; isError?: boolean; data?: Review[]; refetch?: () => void };
function setFlagged(s: FState = {}) {
  vi.mocked(useFlaggedReviews).mockReturnValue({ isPending: false, isError: false, data: [], refetch: vi.fn(), ...s } as never);
}
function setModerate() {
  const m = { mutate: vi.fn(), isPending: false };
  vi.mocked(useModerateReview).mockReturnValue(m as never);
  return m;
}

function renderPage() {
  return render(
    <MemoryRouter>
      <ReviewModerationPage />
    </MemoryRouter>,
  );
}

describe('ReviewModerationPage', () => {
  beforeEach(() => {
    vi.mocked(useFlaggedReviews).mockReset();
    vi.mocked(useModerateReview).mockReset();
    setFlagged({ data: [] });
    setModerate();
  });

  it('shows a skeleton while the queue loads', () => {
    setFlagged({ isPending: true });
    renderPage();
    expect(screen.getByRole('status', { name: /loading/i })).toBeInTheDocument();
  });

  it('shows an error state with retry on failure', () => {
    const refetch = vi.fn();
    setFlagged({ isError: true, refetch });
    renderPage();
    expect(screen.getByText(/couldn't load the moderation queue/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows an empty state when nothing is flagged', () => {
    setFlagged({ data: [] });
    renderPage();
    expect(screen.getByText(/nothing to moderate/i)).toBeInTheDocument();
  });

  it('lists flagged reviews and lets the admin clear the flag', () => {
    const m = setModerate();
    setFlagged({ data: [makeReview()] });
    renderPage();
    expect(screen.getByText(/spammy nonsense/i)).toBeInTheDocument();
    expect(screen.getByText('spam')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /clear flag/i }));
    expect(m.mutate).toHaveBeenCalledWith({ id: 'r1', clearFlag: true }, expect.anything());
  });

  it('"Hide review" unpublishes and clears the flag', () => {
    const m = setModerate();
    setFlagged({ data: [makeReview({ id: 'r7' })] });
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /hide review/i }));
    expect(m.mutate).toHaveBeenCalledWith({ id: 'r7', isPublished: false, clearFlag: true }, expect.anything());
  });
});
