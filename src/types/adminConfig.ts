/**
 * Admin master-data domain types (the configurable lookup tables — see §7).
 * These mirror the migration-001 tables; the API speaks `snake_case`, transforms
 * bridge to these `camelCase` shapes.
 */

/** Generic lookup row — `car_types`, `fuel_types`, `vehicle_makes` (its `name` is normalised to `label`). */
export interface LookupRow {
  id: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
}

/** A vehicle model — belongs to a make; may pre-fill car type & seats. */
export interface VehicleModelRow {
  id: string;
  makeId: string;
  name: string;
  defaultCarTypeId?: string;
  defaultSeats?: number;
  sortOrder: number;
  isActive: boolean;
}

export interface SeatOptionRow {
  value: number;
  isActive: boolean;
}

export interface CityRow {
  id: string;
  name: string;
  state: string;
  lat: number;
  lng: number;
  sortOrder: number;
  isActive: boolean;
}

export interface LanguageRow {
  code: string;
  nativeName: string;
  englishName: string;
  displayOrder: number;
  isActive: boolean;
}

export type ReviewTagCategory = 'passenger_to_driver' | 'manager_to_driver' | 'driver_to_manager';
export type ReviewTagSentiment = 'positive' | 'neutral' | 'negative';
export interface ReviewTagRow {
  id: string;
  label: string;
  category: ReviewTagCategory;
  sentiment: ReviewTagSentiment;
  sortOrder: number;
  isActive: boolean;
}

export type CancelReasonAppliesTo = 'agent' | 'driver' | 'both';
export interface CancelReasonRow {
  id: string;
  label: string;
  appliesTo: CancelReasonAppliesTo;
  sortOrder: number;
  isActive: boolean;
}

export interface AppSettings {
  minVehicleYear: number;
  vehicleExpiryWarningDays: number;
  defaultAlertRadiusKm: number;
  /** Percentage. */
  defaultCommissionPct: number;
  /** ₹ flat amount per trip (NOT a percentage — renamed from `defaultGstPct` in migration 029). */
  defaultGstAmount: number;
  /** ₹ per day. Multi-day trips multiply this by the day count automatically. */
  defaultDriverBata: number;
  defaultExtrasPaidByPassenger: boolean;
  defaultDriverInstructions: string;
  /** How many ACTIVE vacancies a driver may have at once. CHECK [1,10] in the DB. */
  maxActiveVacanciesPerDriver: number;
  /** When an agent invites a driver from that driver's "I'm available" vacancy, the trip's
   *  pickup must be within this many km of the vacancy's announced city. Drivers without an
   *  active vacancy are not radius-checked. CHECK [1,200] in the DB. */
  inviteMaxRadiusKm: number;
  // ── Dispatch (platform algorithm toggle + Auto-dispatch tuning) ───────────
  /** Which dispatch algorithm the whole platform runs. `auto` = "I'm Online" presence +
   *  token-queue offers; `manual` = "I'm vacant" + apply + agent-picks (today's flow). */
  dispatchAlgorithm: DispatchAlgorithm;
  /** Auto: seconds a driver has to accept an offer before it advances. CHECK [15,300]. */
  dispatchOfferSeconds: number;
  /** Auto: seconds a driver keeps their queue place after going offline. CHECK [30,1800]. */
  dispatchOfflineGraceSeconds: number;
  /** Auto: first search radius around a pickup, km. CHECK [1,100]. */
  dispatchInitialRadiusKm: number;
  /** Auto: how much the radius grows each round when nobody nearby accepts, km. CHECK [0,100]. */
  dispatchRadiusWidenKm: number;
  /** Auto: how many widening passes before a cooldown. CHECK [1,5]. */
  dispatchMaxPasses: number;
  /** Auto: seconds to wait before auto-retrying an exhausted trip. CHECK [30,3600]. */
  dispatchRetryCooldownSeconds: number;
  /** Auto: how many retry cycles before marking the trip Unfilled. CHECK [0,20]. */
  dispatchMaxRetries: number;
  /** Auto: no GPS heartbeat for this long ⇒ treated as offline. CHECK [30,600]. */
  dispatchHeartbeatStaleSeconds: number;
}

export type DispatchAlgorithm = 'auto' | 'manual';

// ── write-side input shapes ─────────────────────────────────────────────────
export interface LookupInput {
  label: string;
  sortOrder?: number;
  isActive?: boolean;
}
export interface VehicleModelInput {
  makeId: string;
  name: string;
  defaultCarTypeId?: string | null;
  defaultSeats?: number | null;
  sortOrder?: number;
  isActive?: boolean;
}
export interface CityInput {
  name: string;
  state: string;
  lat: number;
  lng: number;
  sortOrder?: number;
  isActive?: boolean;
}
export interface LanguageInput {
  code: string;
  nativeName: string;
  englishName: string;
  displayOrder?: number;
  isActive?: boolean;
}
export interface ReviewTagInput {
  label: string;
  category: ReviewTagCategory;
  sentiment?: ReviewTagSentiment;
  sortOrder?: number;
  isActive?: boolean;
}
export interface CancelReasonInput {
  label: string;
  appliesTo: CancelReasonAppliesTo;
  sortOrder?: number;
  isActive?: boolean;
}
export type AppSettingsInput = Partial<AppSettings>;
