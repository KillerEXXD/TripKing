import type { UserRole } from './user';

/** The user who first registered a passenger (joined on `GET /passengers`). */
export interface PassengerReferrer {
  id: string;
  displayName: string;
  role: UserRole;
  phone?: string;
}

/**
 * A passenger in the directory — identity only. Per-trip details (headcount,
 * luggage, special requests) stay on the `Trip`; the passenger record holds the
 * phone (the natural key), the canonical name (the first registrant's — never
 * overwritten), and who/when first registered them.
 */
export interface Passenger {
  id: string;
  /** E.164. The unique key — one passenger per phone. */
  phone: string;
  /** Canonical name (the first trip's). Never overwritten by later trips. */
  name: string;
  /** Other names this phone has been entered under (excludes `name`). */
  aliases: string[];
  referredByUserId?: string;
  /** Joined on the admin list; usually absent on the lookup. */
  referredBy?: PassengerReferrer;
  firstTripId?: string;
  firstSeenAt?: string;
  /** How many trips have referenced this phone. */
  tripsCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface PassengersQueryParams {
  /** name / phone search. */
  q?: string;
  sort?: string;
  page?: number;
  limit?: number;
}
