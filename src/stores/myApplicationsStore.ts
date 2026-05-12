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
}

interface MyApplicationsStore {
  byTrip: Record<string, MyApplication>;
  recordApplication: (app: MyApplication) => void;
  clearApplication: (tripId: string) => void;
  reset: () => void;
}

export const useMyApplicationsStore = create<MyApplicationsStore>()(
  persist(
    (set, get) => ({
      byTrip: {},
      recordApplication: (app) => set({ byTrip: { ...get().byTrip, [app.tripId]: app } }),
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
