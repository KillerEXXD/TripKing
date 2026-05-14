-- Migration 029 — change GST default from a percentage to a flat ₹ amount.
--
-- Per the platform owner (2026-05-14): default GST is collected as a fixed rupee
-- amount per trip, not as a percentage of fare. The legacy `default_gst_pct`
-- (numeric 5,2, defaulted to 5) is renamed to `default_gst_amount` (integer
-- rupees, defaulted to 100). Existing rows are migrated from "5 (percent)" to
-- "100 (rupees)" — there is only ever one row in `app_settings` (CHECK id = 1),
-- so this is a one-row data migration.
--
-- Trips themselves continue to store the GST as a rupee amount in
-- `trips.gst_amount` (unchanged); only the default-template on `app_settings`
-- moves from a % to a flat ₹.
--
-- Also clarifies the `default_driver_bata` column comment to call out that the
-- value is per day (already enforced by the Post-a-trip form, which multiplies
-- by the trip's day count).

alter table public.app_settings
  rename column default_gst_pct to default_gst_amount;

alter table public.app_settings
  alter column default_gst_amount type integer using round(default_gst_amount)::integer;

update public.app_settings set default_gst_amount = 100 where id = 1;
alter table public.app_settings
  alter column default_gst_amount set default 100;

comment on column public.app_settings.default_gst_amount is
  'Default GST in rupees (a flat amount, not a percentage). Pre-fills the Post-a-trip form.';
comment on column public.app_settings.default_driver_bata is
  'Default driver bata (₹) per day. Pre-fills the Post-a-trip form; multi-day trips multiply this by the day count.';
