-- Add 'ready_for_approval' to the kyc_status enum on drivers and trip_managers.
-- Set by the backend when every checklist step is done and the applicant is awaiting
-- a final admin click.

alter table public.drivers drop constraint if exists drivers_kyc_status_check;
alter table public.drivers
  add constraint drivers_kyc_status_check
  check (kyc_status in ('pending','docs_submitted','video_pending','ready_for_approval','approved','rejected','resubmit_required'));

alter table public.trip_managers drop constraint if exists trip_managers_kyc_status_check;
alter table public.trip_managers
  add constraint trip_managers_kyc_status_check
  check (kyc_status in ('pending','docs_submitted','video_pending','ready_for_approval','approved','rejected','resubmit_required'));
