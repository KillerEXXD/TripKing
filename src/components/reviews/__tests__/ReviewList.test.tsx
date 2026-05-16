import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReviewList } from '@/components/reviews/ReviewList';
import type { Review } from '@/types';

function makeReview(over: Partial<Review> = {}): Review {
  return {
    id: 'r1',
    tripId: 't1',
    raterUserId: 'u9',
    raterRole: 'trip_manager',
    rateeUserId: 'u1',
    direction: 'manager_to_driver',
    score: 4,
    comment: 'Great driver, very punctual.',
    tagIds: ['tag1'],
    isPublished: true,
    isFlagged: false,
    createdAt: new Date().toISOString(),
    ...over,
  };
}

describe('ReviewList', () => {
  it('renders each review with its stars, comment and rater label', () => {
    render(<ReviewList reviews={[makeReview()]} />);
    expect(screen.getByText('Great driver, very punctual.')).toBeInTheDocument();
    expect(screen.getByText(/A trip manager/i)).toBeInTheDocument();
    expect(screen.getByLabelText('4 out of 5')).toBeInTheDocument();
  });

  it('fills exactly `score` stars — a 3★ review renders 3 amber + 2 grey, not 5', () => {
    const { container } = render(<ReviewList reviews={[makeReview({ score: 3 })]} />);
    const stars = container.querySelectorAll('[aria-label="3 out of 5"] svg');
    expect(stars).toHaveLength(5);
    const filled = Array.from(stars).filter((el) => el.getAttribute('class')?.includes('fill-amber-400'));
    const empty = Array.from(stars).filter((el) => el.getAttribute('class')?.includes('fill-transparent'));
    expect(filled).toHaveLength(3);
    expect(empty).toHaveLength(2);
  });

  it('renders tag labels when a label map is supplied', () => {
    render(<ReviewList reviews={[makeReview({ tagIds: ['tag1'] })]} tagLabels={{ tag1: 'Punctual' }} />);
    expect(screen.getByText('★ Punctual')).toBeInTheDocument();
  });

  it('labels a passenger review as such', () => {
    render(<ReviewList reviews={[makeReview({ raterRole: 'passenger', raterUserId: undefined, direction: 'passenger_to_driver', comment: 'Smooth ride!' })]} />);
    expect(screen.getByText('Smooth ride!')).toBeInTheDocument();
    expect(screen.getByText(/A passenger/i)).toBeInTheDocument();
  });
});
