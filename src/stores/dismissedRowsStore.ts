import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

/**
 * Per-device "hide this row" set for terminal-state list rows the user has
 * already acknowledged — withdrawn / declined / expired invites and
 * withdrawn / rejected / expired applicants. The server keeps the row (audit
 * history), but the user can dismiss it from their view so the list isn't
 * cluttered with red rows after the fact. Reload preserves the dismissal;
 * a fresh acceptance/invite with a new id reappears.
 *
 * The key is the row id (invite id or acceptance id — both UUIDs, no
 * collision risk).
 */
interface DismissedRowsStore {
  ids: Record<string, true>;
  dismiss: (id: string) => void;
  isDismissed: (id: string) => boolean;
  reset: () => void;
}

export const useDismissedRowsStore = create<DismissedRowsStore>()(
  persist(
    (set, get) => ({
      ids: {},
      dismiss: (id) => set({ ids: { ...get().ids, [id]: true } }),
      isDismissed: (id) => !!get().ids[id],
      reset: () => set({ ids: {} }),
    }),
    { name: 'tripking:dismissed-rows', storage: createJSONStorage(() => localStorage), version: 1 },
  ),
);
