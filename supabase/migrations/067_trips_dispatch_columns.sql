-- Trip dispatch columns (PR1 schema; BEHAVIOUR-NEUTRAL — additive, mirrors the
-- two-step-handshake columns added in migration 030).
--
-- These drive the Auto-dispatch offer loop. `dispatch_mode` is FROZEN per trip
-- at POST time from app_settings.dispatch_algorithm — that freeze is what makes
-- a toggle flip "drain gracefully" (in-flight trips finish in their own mode).
-- Defaults to 'manual' so existing rows + new posts are unaffected until the
-- engine + the platform flip to 'auto' land. Auto and Manual both converge on
-- the existing trips.assigned_* columns, so /start, /complete, OTP, tracking
-- and payouts are untouched.

alter table public.trips
  add column if not exists dispatch_mode           text    not null default 'manual' check (dispatch_mode in ('auto','manual')),
  add column if not exists dispatch_status         text    check (dispatch_status in ('searching','offering','widening','waiting','filled','unfilled')),
  add column if not exists current_offer_driver_id uuid references public.drivers(id),
  add column if not exists current_offer_token     bigint,
  add column if not exists offer_deadline_at        timestamptz,
  add column if not exists current_radius_km        numeric,
  add column if not exists pass_number              integer not null default 0,
  add column if not exists retry_count              integer not null default 0,
  add column if not exists next_retry_at            timestamptz;

create index if not exists idx_trips_dispatch_active on public.trips (dispatch_status)
  where dispatch_status in ('searching','offering','widening','waiting');

analyze public.trips;
