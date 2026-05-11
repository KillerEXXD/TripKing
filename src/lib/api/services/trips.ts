/**
 * Trips service.
 *
 * In production this calls the DriverMahal API (`/trips`, `/trips/:id`, etc.)
 * via `apiClient`. For the prototype it returns mock data with a small delay
 * so React Query and loading states render realistically.
 *
 * Resolution order for getTrip(id):
 *   1. mockTrips (seed fixtures)
 *   2. userPostedTripsStore (current user's posted trips on this device)
 *   3. URL hash fragment `#d=...` (cross-device share — driver opens a link
 *      shared from the manager's device and the trip data rides along in
 *      the URL itself)
 */

import { mockTrips, mockAcceptances } from '@/data/mockData';
import { useUserPostedTripsStore } from '@/stores/userPostedTripsStore';
import { decodeTripFromHash } from '@/lib/share/tripShare';
import type { Trip, TripAcceptance, TripStatus } from '@/types';

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

function userTrips(): Trip[] {
  return useUserPostedTripsStore.getState().trips;
}

function tripFromUrlHash(id: string): Trip | null {
  if (typeof window === 'undefined') return null;
  const decoded = decodeTripFromHash(window.location.hash);
  if (decoded && decoded.id === id) return decoded;
  return null;
}

export async function listTrips(params?: { status?: TripStatus[] }): Promise<Trip[]> {
  await sleep(120);
  const all = [...userTrips(), ...mockTrips];
  if (!params?.status) return all;
  return all.filter((t) => params.status!.includes(t.status));
}

export async function getTrip(id: string): Promise<Trip | null> {
  await sleep(80);
  return (
    mockTrips.find((t) => t.id === id) ??
    userTrips().find((t) => t.id === id) ??
    tripFromUrlHash(id) ??
    null
  );
}

export async function listMyPostedTrips(_userId: string): Promise<Trip[]> {
  await sleep(120);
  // User's own posts first, then fall back to seed mock so the demo isn't empty
  return [...userTrips(), ...mockTrips];
}

export async function listApplicantsForTrip(tripId: string): Promise<TripAcceptance[]> {
  await sleep(120);
  return mockAcceptances.filter((a) => a.tripId === tripId);
}

export async function applyToTrip(_tripId: string, _vehicleId: string) {
  await sleep(200);
  return { success: true };
}

export async function selectApplicant(_tripId: string, _acceptanceId: string) {
  await sleep(200);
  return { success: true };
}
