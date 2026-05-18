import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RecentReviewsCard } from '@/components/home/RecentReviewsCard';
import { useDriverReviews } from '@/hooks/useReviews';
import type { Review } from '@/types';

vi.mock('@/hooks/useReviews', () => ({ useDriverReviews: vi.fn() }));

function review(over: Partial<Review> = {}): Review {
  return {
    id: 'r1',
    tripId: 't1',
    raterUserId: 'driver1',
    raterRole: 'driver',
    rateeUserId: 'agent1',
    direction: 'driver_to_manager',
    score: 5,
    comment: 'Great agent, paid on time.',
    tagIds: [],
    isPublished: true,
    isFlagged: false,
    createdAt: '2026-05-18T08:00:00.000Z',
    ...over,
  };
}

function renderCard() {
  return render(
    <MemoryRouter>
      <RecentReviewsCard userId="agent1" />
    </MemoryRouter>,
  );
}

describe('RecentReviewsCard', () => {
  it('renders nothing when there are no published reviews', () => {
    vi.mocked(useDriverReviews).mockReturnValue({ data: [], isPending: false, isError: false } as never);
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the latest driver→manager reviews with a star average (D4 regression)', () => {
    vi.mocked(useDriverReviews).mockReturnValue({
      data: [review({ id: 'r1', score: 5, comment: 'Great agent' }), review({ id: 'r2', score: 3, comment: 'OK' })],
      isPending: false,
      isError: false,
    } as never);
    renderCard();
    expect(screen.getByText(/Recent reviews/i)).toBeInTheDocument();
    expect(screen.getByText(/Great agent/i)).toBeInTheDocument();
    expect(screen.getByText(/4\.0★ · 2/)).toBeInTheDocument();
  });

  it('filters out unpublished reviews even if the hook returns them', () => {
    vi.mocked(useDriverReviews).mockReturnValue({
      data: [review({ id: 'r1', isPublished: false, comment: 'Hidden' })],
      isPending: false,
      isError: false,
    } as never);
    const { container } = renderCard();
    expect(container).toBeEmptyDOMElement();
  });

  it('queries with direction=driver_to_manager for the signed-in agent', () => {
    vi.mocked(useDriverReviews).mockReturnValue({ data: [], isPending: false, isError: false } as never);
    renderCard();
    expect(useDriverReviews).toHaveBeenCalledWith(
      'agent1',
      expect.objectContaining({ direction: 'driver_to_manager' }),
    );
  });
});
