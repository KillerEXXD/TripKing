import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { UIAlert } from '@/lib/alertMatcher';
import { newAlertId } from '@/lib/alertMatcher';
import { mockCities } from '@/data/mockData';

interface AlertsState {
  alerts: UIAlert[];
  addAlert: (input: Omit<UIAlert, 'id' | 'createdAt' | 'isPaused'> & {
    isPaused?: boolean;
  }) => UIAlert;
  updateAlert: (id: string, patch: Partial<UIAlert>) => void;
  deleteAlert: (id: string) => void;
  togglePause: (id: string) => void;
  /** Hard-reset to seed (handy for prototype demos / "reset" button). */
  reseed: () => void;
}

const HOURS = 3600_000;
const DAYS = 24 * HOURS;

/**
 * Seed alerts so the list is never empty on first visit. Re-computed on each
 * persisted-store hydration if the user's never added their own.
 *
 * Built dynamically against `now()` so the demo always has a believable mix
 * of "expires in 6h" / "expires tomorrow" / "expired 2 days ago".
 */
function buildSeed(): UIAlert[] {
  const now = Date.now();
  return [
    {
      id: 'seed-vellore-chennai',
      name: 'Vellore → Chennai',
      from: pickCity('Vellore'),
      fromRadiusKm: 25,
      to: pickCity('Chennai'),
      toRadiusKm: 25,
      pickupFrom: new Date(now).toISOString(),
      pickupUntil: new Date(now + 12 * HOURS).toISOString(),
      minRatePerKm: 14,
      isPaused: false,
      createdAt: new Date(now - 30 * 60_000).toISOString(),
    },
    {
      id: 'seed-blore-anywhere',
      name: 'Bangalore → anywhere',
      from: pickCity('Bangalore'),
      fromRadiusKm: 40,
      to: null,
      toRadiusKm: null,
      pickupFrom: new Date(now).toISOString(),
      pickupUntil: new Date(now + 2 * DAYS).toISOString(),
      minRatePerKm: null,
      isPaused: false,
      createdAt: new Date(now - 6 * HOURS).toISOString(),
    },
    {
      id: 'seed-salem-coimbatore',
      name: 'Salem → Coimbatore',
      from: pickCity('Salem'),
      fromRadiusKm: 30,
      to: pickCity('Coimbatore'),
      toRadiusKm: 30,
      pickupFrom: new Date(now - 3 * DAYS).toISOString(),
      // Already past — demonstrates the "expired" section
      pickupUntil: new Date(now - 2 * HOURS).toISOString(),
      minRatePerKm: null,
      isPaused: false,
      createdAt: new Date(now - 4 * DAYS).toISOString(),
    },
  ];
}

function pickCity(name: string) {
  const c = mockCities.find((x) => x.name === name) ?? mockCities[0]!;
  return { name: c.name, state: c.state, lat: c.lat, lng: c.lng };
}

export const useAlertsStore = create<AlertsState>()(
  persist(
    (set, get) => ({
      alerts: buildSeed(),
      addAlert: (input) => {
        const alert: UIAlert = {
          ...input,
          isPaused: input.isPaused ?? false,
          id: newAlertId(),
          createdAt: new Date().toISOString(),
        };
        set({ alerts: [alert, ...get().alerts] });
        return alert;
      },
      updateAlert: (id, patch) =>
        set({
          alerts: get().alerts.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        }),
      deleteAlert: (id) =>
        set({ alerts: get().alerts.filter((a) => a.id !== id) }),
      togglePause: (id) =>
        set({
          alerts: get().alerts.map((a) =>
            a.id === id ? { ...a, isPaused: !a.isPaused } : a,
          ),
        }),
      reseed: () => set({ alerts: buildSeed() }),
    }),
    {
      name: 'drivermahal:alerts',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);
