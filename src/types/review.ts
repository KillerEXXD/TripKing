export type ReviewDirection = 'passenger_to_driver' | 'manager_to_driver' | 'driver_to_manager';
export type RaterRole = 'driver' | 'trip_manager' | 'admin' | 'passenger';
export type ReviewScore = 1 | 2 | 3 | 4 | 5;

export interface Review {
  id: string;
  tripId: string;
  /** null for anonymous passenger reviews. */
  raterUserId?: string;
  raterRole: RaterRole;
  rateeUserId?: string;
  direction: ReviewDirection;
  score: ReviewScore;
  comment: string;
  tagIds: string[];
  isPublished: boolean;
  isFlagged: boolean;
  flagReason?: string;
  createdAt: string;
}

export interface ReviewInput {
  tripId: string;
  rateeUserId?: string;
  direction: ReviewDirection;
  score: number;
  comment?: string;
  tagIds?: string[];
}
export interface ReviewsQueryParams {
  tripId?: string;
  rateeUserId?: string;
  direction?: ReviewDirection;
  /** Admin moderation queue — `?flagged=true` (only honoured for admins). */
  flagged?: boolean;
  page?: number;
  limit?: number;
}
