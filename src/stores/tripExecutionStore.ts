import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface OdoPhoto {
  /** Data URL of the snapped image. Capped at ~700KB to keep localStorage happy. */
  dataUrl: string;
  filename: string;
  capturedAt: string;
  /** Optional driver-typed reading (km) — not OCR'd in the prototype. */
  reading?: number;
}

export interface TripExecution {
  tripId: string;
  startedAt?: string;
  completedAt?: string;
  startOdo?: OdoPhoto;
  endOdo?: OdoPhoto;
  /** Free-form notes the driver adds during the trip. */
  driverNotes?: string;
  /** Optional cancel reason if the driver bails after assignment. */
  driverCancelledAt?: string;
  driverCancelReason?: string;
}

interface TripExecutionStore {
  byTrip: Record<string, TripExecution>;
  /** Start the trip. The odometer photo is optional — it can be added later. */
  startTrip: (tripId: string, photo?: OdoPhoto, notes?: string) => void;
  /** Complete the trip. The odometer photo is optional. */
  completeTrip: (tripId: string, photo?: OdoPhoto, notes?: string) => void;
  setNotes: (tripId: string, notes: string) => void;
  cancel: (tripId: string, reason: string) => void;
  reset: () => void;
}

export const useTripExecutionStore = create<TripExecutionStore>()(
  persist(
    (set, get) => ({
      byTrip: {},
      startTrip: (tripId, photo, notes) =>
        set({
          byTrip: {
            ...get().byTrip,
            [tripId]: {
              ...get().byTrip[tripId],
              tripId,
              // Don't overwrite the start time if the trip is already running
              // (e.g. when adding the odometer photo after starting).
              startedAt: get().byTrip[tripId]?.startedAt ?? new Date().toISOString(),
              startOdo: photo ?? get().byTrip[tripId]?.startOdo,
              driverNotes: notes ?? get().byTrip[tripId]?.driverNotes,
            },
          },
        }),
      completeTrip: (tripId, photo, notes) =>
        set({
          byTrip: {
            ...get().byTrip,
            [tripId]: {
              ...get().byTrip[tripId],
              tripId,
              completedAt: get().byTrip[tripId]?.completedAt ?? new Date().toISOString(),
              endOdo: photo ?? get().byTrip[tripId]?.endOdo,
              driverNotes: notes ?? get().byTrip[tripId]?.driverNotes,
            },
          },
        }),
      setNotes: (tripId, notes) =>
        set({
          byTrip: {
            ...get().byTrip,
            [tripId]: {
              ...(get().byTrip[tripId] ?? { tripId }),
              driverNotes: notes,
            },
          },
        }),
      cancel: (tripId, reason) =>
        set({
          byTrip: {
            ...get().byTrip,
            [tripId]: {
              ...(get().byTrip[tripId] ?? { tripId }),
              driverCancelledAt: new Date().toISOString(),
              driverCancelReason: reason,
            },
          },
        }),
      reset: () => set({ byTrip: {} }),
    }),
    {
      name: 'drivermahal:trip-execution',
      storage: createJSONStorage(() => localStorage),
      version: 1,
    },
  ),
);

/**
 * Compress + convert a File to a data URL. Cap at ~700KB so the persisted
 * store stays under the 5 MB localStorage budget even with several photos.
 */
export async function fileToCappedDataUrl(file: File, maxBytes = 700_000): Promise<string> {
  // For the prototype, draw to a canvas at progressively smaller dimensions
  // until under the cap.
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    let scale = 1;
    let dataUrl = '';
    for (let i = 0; i < 6; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2d context unavailable');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      if (dataUrl.length <= maxBytes) break;
      scale *= 0.7;
    }
    return dataUrl;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
