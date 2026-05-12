import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReviewForm } from '@/components/reviews/ReviewForm';
import { ApiError } from '@/lib/api/client';

vi.mock('@/hooks/useReviews', () => ({ useCreateReview: vi.fn() }));
import { useCreateReview } from '@/hooks/useReviews';
vi.mock('@/hooks/useAdminConfig', () => ({ useReviewTagsByCategory: vi.fn() }));
import { useReviewTagsByCategory } from '@/hooks/useAdminConfig';
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { toast } from 'sonner';

function setCreate(over: Partial<{ mutateAsync: ReturnType<typeof vi.fn>; isPending: boolean }> = {}) {
  const mutateAsync = vi.fn().mockResolvedValue({ id: 'r1' });
  vi.mocked(useCreateReview).mockReturnValue({ mutateAsync, isPending: false, ...over } as never);
  return mutateAsync;
}
function setTags(tags: Array<{ id: string; label: string; category: string; isActive: boolean }> = []) {
  vi.mocked(useReviewTagsByCategory).mockReturnValue({ data: tags } as never);
}

describe('ReviewForm', () => {
  beforeEach(() => {
    vi.mocked(useCreateReview).mockReset();
    vi.mocked(useReviewTagsByCategory).mockReset();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    setCreate();
    setTags();
  });

  it('renders the star picker and a comment box', () => {
    render(<ReviewForm tripId="t1" direction="manager_to_driver" rateeNoun="the driver" />);
    expect(screen.getByText(/rate the driver/i)).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    expect(screen.getByLabelText(/comment/i)).toBeInTheDocument();
  });

  it('submits with the default 5★ score and the trip + direction', async () => {
    const mutateAsync = setCreate();
    render(<ReviewForm tripId="t1" direction="driver_to_manager" rateeNoun="the trip manager" />);
    fireEvent.click(screen.getByRole('button', { name: /submit review/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ tripId: 't1', direction: 'driver_to_manager', score: 5 })));
    expect(toast.success).toHaveBeenCalled();
  });

  it('uses the picked star score and selected tags', async () => {
    const mutateAsync = setCreate();
    setTags([{ id: 'tag1', label: 'Punctual', category: 'manager_to_driver', isActive: true }]);
    render(<ReviewForm tripId="t1" direction="manager_to_driver" rateeNoun="the driver" />);
    fireEvent.click(screen.getByRole('radio', { name: /3 stars/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Punctual' }));
    fireEvent.click(screen.getByRole('button', { name: /submit review/i }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ score: 3, tagIds: ['tag1'] })));
  });

  it('treats a 409 (already reviewed) as success and calls onDone', async () => {
    const onDone = vi.fn();
    setCreate({ mutateAsync: vi.fn().mockRejectedValue(new ApiError('A review for this trip and direction already exists', 409)) });
    render(<ReviewForm tripId="t1" direction="manager_to_driver" rateeNoun="the driver" onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: /submit review/i }));
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(onDone).toHaveBeenCalled();
  });

  it('shows an error toast on other failures', async () => {
    setCreate({ mutateAsync: vi.fn().mockRejectedValue(new Error('boom')) });
    render(<ReviewForm tripId="t1" direction="manager_to_driver" rateeNoun="the driver" />);
    fireEvent.click(screen.getByRole('button', { name: /submit review/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
  });
});
