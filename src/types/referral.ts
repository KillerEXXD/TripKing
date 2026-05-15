/**
 * Referral program — Stage 1 types. The backend attaches `referralCode` and a
 * (zeroed in Stage 1) `referralSummary` to `GET /drivers/me` and `GET /agents/me`.
 * Tier / payout fields land in later stages.
 */
export interface ReferralSummary {
  /** Count of users who signed up with this referrer's code (any role). */
  totalReferred: number;
  /** Lifetime referral earnings, in paise. Always 0 until Stage 4. */
  totalEarningsPaise: number;
}
