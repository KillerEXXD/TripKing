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
}

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
