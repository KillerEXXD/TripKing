-- TripKing — migration 010: add the dedicated "number-plate close-up" photo slot to vehicles.
-- (The driver onboarding "Vehicle photos" step requires front / back / left / right / number-plate
-- + RC book + insurance; the first four + RC + insurance already had columns since migration 002.)
alter table public.vehicles
  add column if not exists photo_plate_url text not null default '';
analyze public.vehicles;
