-- TripKing — migration 007: driver / trip-manager KYC document columns + review-audit columns.
-- The document images themselves live in the private `driver-kyc/` / `manager-kyc/` Supabase
-- Storage buckets (migration 009); these columns hold the object PATH inside the bucket
-- (never a public URL — the edge function mints a short-lived signed URL on read), plus the
-- compliance-masked Aadhaar last-4, the driver-licence number/expiry, the upload-consent
-- timestamp, and who/when/why the admin reviewed. Conventions per migrations 001/002.

-- ─────────────────────────────────────────────────────────────────────────────
-- drivers — full KYC doc set: Aadhaar (front+back), Driving Licence, selfie
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.drivers
  add column if not exists aadhaar_number_masked  text,        -- last 4 digits only (UIDAI compliance), e.g. '••••1234'
  add column if not exists aadhaar_front_path      text,        -- object path in storage bucket 'driver-kyc'
  add column if not exists aadhaar_back_path       text,
  add column if not exists driver_license_number   text,
  add column if not exists driver_license_path      text,
  add column if not exists driver_license_expiry   date,
  add column if not exists selfie_path             text,
  add column if not exists kyc_consent_at          timestamptz, -- when the driver accepted the document-upload consent
  add column if not exists kyc_docs_submitted_at   timestamptz,
  add column if not exists kyc_reviewed_by         uuid references public.users(id) on delete set null,
  add column if not exists kyc_reviewed_at         timestamptz,
  add column if not exists kyc_rejection_reason    text;

-- ─────────────────────────────────────────────────────────────────────────────
-- trip_managers — lighter KYC: Aadhaar (front+back) + selfie (no driving licence)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.trip_managers
  add column if not exists aadhaar_number_masked  text,
  add column if not exists aadhaar_front_path      text,
  add column if not exists aadhaar_back_path       text,
  add column if not exists selfie_path             text,
  add column if not exists kyc_consent_at          timestamptz,
  add column if not exists kyc_docs_submitted_at   timestamptz,
  add column if not exists kyc_reviewed_by         uuid references public.users(id) on delete set null,
  add column if not exists kyc_reviewed_at         timestamptz,
  add column if not exists kyc_rejection_reason    text;

create index if not exists idx_drivers_kyc_status on public.drivers (kyc_status);
create index if not exists idx_trip_managers_kyc_status on public.trip_managers (kyc_status);

analyze public.drivers;
analyze public.trip_managers;
