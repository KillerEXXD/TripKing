import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * A driver's pending application for a trip, kept on this device. The
 * `GET /trips/:id/applicants` endpoint is poster-only, so a driver can't read
 * back their own application from the API yet — we remember it locally so the
 * trip-detail screen can show the "Applied" state + a Withdraw action. (A proper
 * "my applications" lookup is flagged for the backend lane — see
 * `docs/CONTINUE_HERE_FRONTEND.md`.)
 */
export interface MyApplication {
  tripId: string;
  /** The `trip_acceptances` row id — needed to withdraw via the API. */
  acceptanceId: string;
  appliedAt: string;
  quotedRatePerKm?: number;
  message?: string;
  /**
   * If the driver withdrew this application, the timestamp it was withdrawn
   * at. Kept in the store (instead of dropping the row) so the trip card
   * still surfaces the "Withdrawn" state — reminds the driver they pulled
   * out so they don't accidentally re-apply. Re-applying via the apply
   * flow overwrites the row and clears this field.
   */
  withdrawnAt?: string;
}

interface MyApplicationsStore {
  byTrip: Record<string, MyApplication>;
  recordApplication: (app: MyApplication) => void;
  markWithdrawn: (tripId: string) => void;
  /**
   * Hard-remove a stored application. Use this for stale data (the trip
   * itself was cancelled / completed, etc.) — for the driver-initiated
   * withdraw flow, prefer `markWithdrawn` so the card can reflect the
   * status.
   */
  clearApplication: (tripId: string) => void;
  reset: () => void;
}

export const useMyApplicationsStore = create<MyApplicationsStore>()(
  persist(
    (set, get) => ({
      byTrip: {},
      recordApplication: (app) => set({ byTrip: { ...get().byTrip, [app.tripId]: app } }),
      markWithdrawn: (tripId) => {
        const existing = get().byTrip[tripId];
        if (!existing) return;
        set({ byTrip: { ...get().byTrip, [tripId]: { ...existing, withdrawnAt: new Date().toISOString() } } });
      },
      clearApplication: (tripId) => {
        const next = { ...get().byTrip };
        delete next[tripId];
        set({ byTrip: next });
      },
      reset: () => set({ byTrip: {} }),
    }),
    { name: 'tripking:my-applications', storage: createJSONStorage(() => localStorage), version: 1 },
  ),
);

/** "5 min ago" / "2 hrs ago" / "3d ago" — for the "Submitted …" line. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 60_000) return 'just now';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`;
  return `${Math.round(hrs / 24)}d ago`;
}
