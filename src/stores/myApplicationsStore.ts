import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface MyApplication {
  tripId: string;
  appliedAt: string;
  /** Optional counter-quote on rate per km when applying. */
  quotedRatePerKm?: number;
  /** Optional message to the trip poster. */
  message?: string;
  /** Set when the driver withdraws their own application. */
  withdrawnAt?: string;
}

interface MyApplicationsStore {
  byTrip: Record<string, MyApplication>;
  apply: (
    tripId: string,
    opts?: { quotedRatePerKm?: number; message?: string },
  ) => MyApplication;
  withdraw: (tripId: string) => void;
  reset: () => void;
}

export const useMyApplicationsStore = create<MyApplicationsStore>()(
  persist(
    (set, get) => ({
      byTrip: {},
      apply: (tripId, opts) => {
        const app: MyApplication = {
          tripId,
          appliedAt: new Date().toISOString(),
          quotedRatePerKm: opts?.quotedRatePerKm,
          message: opts?.message,
        };
        set({ byTrip: { ...get().byTrip, [tripId]: app } });
        return app;
      },
      withdraw: (tripId) => {
        const cur = get().byTrip[tripId];
        if (!cur) return;
        set({
          byTrip: {
            ...get().byTrip,
            [tripId]: { ...cur, withdrawnAt: new Date().toISOString() },
          },
        });
      },
      reset: () => set({ byTrip: {} }),
    }),
    {
      name: 'drivermahal:my-applications',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);

/** True if the driver has an active (non-withdrawn) application for this trip. */
export function hasActiveApplication(
  tripId: string,
  byTrip: Record<string, MyApplication>,
): boolean {
  const a = byTrip[tripId];
  return !!a && !a.withdrawnAt;
}

export type ApplicationOutcome =
  | 'pending' // awaiting the manager's decision
  | 'selected' // this driver was picked
  | 'not_selected' // another driver was picked
  | 'withdrawn' // the driver pulled their application
  | 'cancelled' // the trip was cancelled
  | 'gone'; // the trip no longer exists on this device

/**
 * Derive the outcome of an application given the (overlay-merged) trip and
 * this driver's id. Pass `trip` already run through `applyOverlay` so its
 * `status` / `assignedDriverId` reflect the manager's actions; pass
 * `undefined` if the trip can't be found on this device.
 */
export function applicationOutcome(
  app: MyApplication,
  trip: { status: string; assignedDriverId?: string | null } | undefined,
  myDriverId: string | undefined,
): ApplicationOutcome {
  if (app.withdrawnAt) return 'withdrawn';
  if (!trip) return 'gone';
  if (trip.status === 'cancelled') return 'cancelled';
  if (trip.assignedDriverId) {
    return trip.assignedDriverId === myDriverId ? 'selected' : 'not_selected';
  }
  return 'pending';
}

/** "5 min ago" / "2 hrs ago" / "3d ago" */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const ms = now - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = mins / 60;
  if (hrs < 24) return `${Math.round(hrs)} hr${Math.round(hrs) > 1 ? 's' : ''} ago`;
  const days = hrs / 24;
  return `${Math.round(days)}d ago`;
}
