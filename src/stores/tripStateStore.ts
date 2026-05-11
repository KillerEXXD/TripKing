import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { TripStatus } from '@/types';

/**
 * Persisted overlay on top of the mock-data trip rows.
 *
 * The mock service returns immutable seed data. This store records every
 * user action (assign / re-assign / cancel) keyed by tripId, and the UI
 * hooks merge it with the base trip when rendering. In production this
 * lives server-side; here it lets the prototype demonstrate state changes
 * without touching mock fixtures.
 */
export interface TripOverlay {
  status?: TripStatus;
  assignedDriverId?: string | null;
  assignedAcceptanceId?: string | null;
  cancelledAt?: string;
  cancelReason?: string;
  /** Per-acceptance status overrides keyed by acceptance id. */
  acceptanceStatuses?: Record<string, 'applied' | 'selected' | 'rejected' | 'withdrawn'>;
  /**
   * Auto-generated when the manager picks a driver. Shared with the
   * passenger out-of-band; the passenger types it on /passenger to view
   * the trip and (optionally) leave a review for the driver.
   */
  passengerOtp?: string;
  /** Manager opt-in: show fare/payout to the passenger on /passenger. */
  showFareToPassenger?: boolean;
  /**
   * Manager opt-in: hide the passenger's phone number from the driver's
   * assigned-trip view. When true, the driver sees only the passenger's
   * name + the manager's contact (so they can route through the manager
   * for any pre-trip questions). The manager can flip this any time.
   */
  hidePassengerPhone?: boolean;
}

interface TripStateStore {
  overlays: Record<string, TripOverlay>;
  /** Mark a specific applicant as selected; others become rejected. */
  assignDriver: (
    tripId: string,
    acceptanceId: string,
    driverId: string,
    allAcceptanceIds: string[],
  ) => void;
  /** Cancel the trip + clear assignment. */
  cancelTrip: (tripId: string, reason: string) => void;
  /** Restore an applicant from rejected → applied (for re-selection). */
  reopenApplicant: (tripId: string, acceptanceId: string) => void;
  /** Manager-side toggle controlling passenger fare visibility on /passenger. */
  setShowFareToPassenger: (tripId: string, show: boolean) => void;
  /** Manager-side toggle hiding passenger phone from the assigned driver. */
  setHidePassengerPhone: (tripId: string, hide: boolean) => void;
  /** Re-issue a fresh OTP (rare; used if the existing one was leaked). */
  regenerateOtp: (tripId: string) => void;
  /** Reset (handy for demos). */
  reset: () => void;
}

/** 6-digit numeric OTP — uppercase letters skipped intentionally to avoid
 *  the "is that an O or a 0?" problem when read aloud. */
function generateOtp(): string {
  return Math.floor(100_000 + Math.random() * 900_000).toString();
}

/**
 * One demo overlay so /passenger has a working OTP on first launch without
 * the user having to play through the manager flow first. OTP is fixed
 * (`123456`) and the trip is pre-assigned to Ravi Kumar. Anyone can wipe
 * this by clearing localStorage or calling reset().
 */
const DEMO_OVERLAYS: Record<string, TripOverlay> = {
  't-1': {
    status: 'assigned',
    assignedDriverId: 'd-ravi',
    assignedAcceptanceId: 'a-0',
    acceptanceStatuses: { 'a-0': 'selected', 'a-1': 'rejected', 'a-2': 'rejected', 'a-3': 'rejected' },
    passengerOtp: '123456',
    showFareToPassenger: true,
  },
};

export const useTripStateStore = create<TripStateStore>()(
  persist(
    (set, get) => ({
      overlays: DEMO_OVERLAYS,
      assignDriver: (tripId, acceptanceId, driverId, allAcceptanceIds) => {
        const acceptanceStatuses: Record<string, 'selected' | 'rejected'> = {};
        for (const aId of allAcceptanceIds) {
          acceptanceStatuses[aId] = aId === acceptanceId ? 'selected' : 'rejected';
        }
        const existing = get().overlays[tripId];
        set({
          overlays: {
            ...get().overlays,
            [tripId]: {
              ...existing,
              status: 'assigned',
              assignedDriverId: driverId,
              assignedAcceptanceId: acceptanceId,
              acceptanceStatuses,
              cancelledAt: undefined,
              cancelReason: undefined,
              // Generate OTP on first assignment; preserve on re-assignment so
              // the passenger doesn't have to be re-notified if the manager
              // swaps drivers.
              passengerOtp: existing?.passengerOtp ?? generateOtp(),
              // Default: fare IS shown unless the manager explicitly hides it
              // in the Post Trip form.
              showFareToPassenger:
                existing?.showFareToPassenger ?? true,
            },
          },
        });
      },
      cancelTrip: (tripId, reason) => {
        set({
          overlays: {
            ...get().overlays,
            [tripId]: {
              ...get().overlays[tripId],
              status: 'cancelled',
              assignedDriverId: null,
              assignedAcceptanceId: null,
              cancelledAt: new Date().toISOString(),
              cancelReason: reason,
            },
          },
        });
      },
      reopenApplicant: (tripId, acceptanceId) => {
        const cur = get().overlays[tripId];
        if (!cur?.acceptanceStatuses) return;
        const next = { ...cur.acceptanceStatuses };
        next[acceptanceId] = 'applied';
        set({
          overlays: {
            ...get().overlays,
            [tripId]: { ...cur, acceptanceStatuses: next },
          },
        });
      },
      setShowFareToPassenger: (tripId, show) => {
        set({
          overlays: {
            ...get().overlays,
            [tripId]: {
              ...(get().overlays[tripId] ?? {}),
              showFareToPassenger: show,
            },
          },
        });
      },
      setHidePassengerPhone: (tripId, hide) => {
        set({
          overlays: {
            ...get().overlays,
            [tripId]: {
              ...(get().overlays[tripId] ?? {}),
              hidePassengerPhone: hide,
            },
          },
        });
      },
      regenerateOtp: (tripId) => {
        set({
          overlays: {
            ...get().overlays,
            [tripId]: {
              ...(get().overlays[tripId] ?? {}),
              passengerOtp: generateOtp(),
            },
          },
        });
      },
      reset: () => set({ overlays: DEMO_OVERLAYS }),
    }),
    {
      name: 'drivermahal:trip-state',
      storage: createJSONStorage(() => localStorage),
      // Bumping version forces re-hydration and re-seeds DEMO_OVERLAYS for
      // existing testers, so the docs you read still match what they see.
      version: 3,
      // Without this, Zustand logs an error on version mismatch. We merge
      // the seed with whatever the user already had so they don't lose
      // their own assignments while still picking up the demo OTP.
      migrate: (persisted, _version) => {
        const prev = (persisted ?? {}) as { overlays?: Record<string, TripOverlay> };
        return {
          overlays: { ...DEMO_OVERLAYS, ...(prev.overlays ?? {}) },
        };
      },
    },
  ),
);

/** Helper: merge an overlay onto a trip's status fields. */
export function applyOverlay<
  T extends {
    id: string;
    status: TripStatus;
    assignedDriverId?: string;
  },
>(trip: T, overlays: Record<string, TripOverlay>): T {
  const ov = overlays[trip.id];
  if (!ov) return trip;
  return {
    ...trip,
    status: ov.status ?? trip.status,
    assignedDriverId: ov.assignedDriverId ?? trip.assignedDriverId,
  };
}

/** Find a trip overlay by OTP — used by the passenger dashboard. */
export function findOverlayByOtp(
  otp: string,
  overlays: Record<string, TripOverlay>,
): { tripId: string; overlay: TripOverlay } | null {
  const cleaned = otp.trim();
  if (cleaned.length === 0) return null;
  for (const [tripId, ov] of Object.entries(overlays)) {
    if (ov.passengerOtp === cleaned) return { tripId, overlay: ov };
  }
  return null;
}
