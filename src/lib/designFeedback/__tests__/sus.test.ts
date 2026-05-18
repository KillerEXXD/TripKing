import { describe, it, expect } from 'vitest';
import { computeSusScore, averageSusScore } from '@/lib/designFeedback/sus';

describe('computeSusScore', () => {
  it('all 5s on positives + all 1s on negatives → 100 (best possible)', () => {
    // Items 1,3,5,7,9 are positive (5 → 4 each); items 2,4,6,8,10 are negative (1 → 4 each).
    // Sum = 40 × 2.5 = 100.
    expect(computeSusScore([5, 1, 5, 1, 5, 1, 5, 1, 5, 1])).toBe(100);
  });

  it('all 1s on positives + all 5s on negatives → 0 (worst possible)', () => {
    expect(computeSusScore([1, 5, 1, 5, 1, 5, 1, 5, 1, 5])).toBe(0);
  });

  it('all neutral 3s → 50 (mid-point)', () => {
    expect(computeSusScore([3, 3, 3, 3, 3, 3, 3, 3, 3, 3])).toBe(50);
  });

  it('throws when response count is wrong', () => {
    expect(() => computeSusScore([1, 2, 3])).toThrow(/expects 10/);
  });

  it('throws when a response is out of range', () => {
    expect(() => computeSusScore([5, 1, 5, 1, 5, 1, 5, 1, 5, 6])).toThrow(/1\.\.5/);
  });
});

describe('averageSusScore', () => {
  it('returns null on empty list', () => {
    expect(averageSusScore([])).toBeNull();
  });

  it('returns the arithmetic mean of the scores', () => {
    expect(averageSusScore([100, 50, 0])).toBe(50);
    expect(averageSusScore([72.5, 67.5])).toBe(70);
  });
});
