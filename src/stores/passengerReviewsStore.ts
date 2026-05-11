import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface PassengerReview {
  tripId: string;
  driverId: string;
  score: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  comment: string;
  createdAt: string;
}

interface PassengerReviewsStore {
  byTrip: Record<string, PassengerReview>;
  /** Per-OTP one-shot consumption flag — once leveraged, prevents replay. */
  consumedOtps: Record<string, string>; // otp → tripId at consume time
  submit: (review: PassengerReview) => void;
  markOtpUsed: (otp: string, tripId: string) => void;
  reset: () => void;
}

export const usePassengerReviewsStore = create<PassengerReviewsStore>()(
  persist(
    (set, get) => ({
      byTrip: {},
      consumedOtps: {},
      submit: (review) =>
        set({ byTrip: { ...get().byTrip, [review.tripId]: review } }),
      markOtpUsed: (otp, tripId) =>
        set({ consumedOtps: { ...get().consumedOtps, [otp]: tripId } }),
      reset: () => set({ byTrip: {}, consumedOtps: {} }),
    }),
    {
      name: 'drivermahal:passenger-reviews',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);

export const PASSENGER_REVIEW_TAGS = [
  'Punctual',
  'Clean car',
  'Polite',
  'Safe driver',
  'Knew the route',
  'Late',
  'Rude',
  'Reckless',
] as const;
