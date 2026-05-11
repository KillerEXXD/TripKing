import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { LocationValue } from '@/components/location/LocationSearchPanel';

export interface MyVacancy {
  id: string;
  driverId: string;
  driverName: string;
  vehicleId: string;
  vehicleLabel: string;
  from: LocationValue;
  destinations: LocationValue[];
  availableFrom: string;
  availableUntil: string;
  minRatePerKm?: number;
  notes?: string;
  status: 'active' | 'cancelled';
  createdAt: string;
}

interface MyVacanciesStore {
  vacancies: MyVacancy[];
  addVacancy: (
    input: Omit<MyVacancy, 'id' | 'status' | 'createdAt'>,
  ) => MyVacancy;
  cancelVacancy: (id: string) => void;
  extendVacancy: (id: string, hours: number) => void;
  reset: () => void;
}

function newId(): string {
  return 'mv-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
}

export const useMyVacanciesStore = create<MyVacanciesStore>()(
  persist(
    (set, get) => ({
      vacancies: [],
      addVacancy: (input) => {
        const v: MyVacancy = {
          ...input,
          id: newId(),
          status: 'active',
          createdAt: new Date().toISOString(),
        };
        set({ vacancies: [v, ...get().vacancies] });
        return v;
      },
      cancelVacancy: (id) =>
        set({
          vacancies: get().vacancies.map((v) =>
            v.id === id ? { ...v, status: 'cancelled' } : v,
          ),
        }),
      extendVacancy: (id, hours) =>
        set({
          vacancies: get().vacancies.map((v) =>
            v.id === id
              ? {
                  ...v,
                  availableUntil: new Date(
                    Math.max(
                      Date.now(),
                      new Date(v.availableUntil).getTime(),
                    ) +
                      hours * 3600_000,
                  ).toISOString(),
                }
              : v,
          ),
        }),
      reset: () => set({ vacancies: [] }),
    }),
    {
      name: 'drivermahal:my-vacancies',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);

/** Selectors */
export function isVacancyActive(v: MyVacancy, now: number = Date.now()): boolean {
  if (v.status !== 'active') return false;
  return new Date(v.availableUntil).getTime() > now;
}
