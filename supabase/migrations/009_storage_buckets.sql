-- TripKing — migration 009: private Supabase Storage buckets for KYC docs, vehicle photos,
-- and video-call recordings. All buckets are PRIVATE (no public URLs); the edge functions
-- mint short-lived signed upload/download URLs (using the service role, which bypasses RLS).
-- The RLS policies below are defence-in-depth for any direct browser access.
--
-- Path conventions (first folder = the owning entity id, so storage RLS can check ownership):
--   driver-kyc/<driver_id>/<doc_type>            (aadhaar_front, aadhaar_back, driver_license, selfie)
--   manager-kyc/<manager_id>/<doc_type>          (aadhaar_front, aadhaar_back, selfie)
--   vehicle-photos/<vehicle_id>/<slot>           (front, back, left, right, plate, interior, rc, insurance, permit)
--   video-recordings/<video_verification_id>/...

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('driver-kyc',       'driver-kyc',       false, 5242880,  array['image/jpeg','image/png','image/webp','application/pdf']),
  ('manager-kyc',      'manager-kyc',      false, 5242880,  array['image/jpeg','image/png','image/webp','application/pdf']),
  ('vehicle-photos',   'vehicle-photos',   false, 5242880,  array['image/jpeg','image/png','image/webp']),
  ('video-recordings', 'video-recordings', false, 524288000, array['video/webm','video/mp4'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- helper: safely cast the first path segment to uuid (null if it isn't one)
create or replace function public.storage_owner_uuid(p_name text)
returns uuid language plpgsql immutable as $$
declare v text;
begin
  v := (storage.foldername(p_name))[1];
  return v::uuid;
exception when others then return null;
end;
$$;

-- driver-kyc: owning driver read+write their own folder; admins read all
drop policy if exists "driver-kyc owner write" on storage.objects;
create policy "driver-kyc owner write" on storage.objects for all to authenticated
  using      (bucket_id = 'driver-kyc' and public.owns_driver(public.storage_owner_uuid(name)))
  with check (bucket_id = 'driver-kyc' and public.owns_driver(public.storage_owner_uuid(name)));
drop policy if exists "driver-kyc admin read" on storage.objects;
create policy "driver-kyc admin read" on storage.objects for select to authenticated
  using (bucket_id = 'driver-kyc' and public.is_admin());

-- manager-kyc: owning manager read+write their own folder; admins read all
drop policy if exists "manager-kyc owner write" on storage.objects;
create policy "manager-kyc owner write" on storage.objects for all to authenticated
  using      (bucket_id = 'manager-kyc' and public.owns_trip_manager(public.storage_owner_uuid(name)))
  with check (bucket_id = 'manager-kyc' and public.owns_trip_manager(public.storage_owner_uuid(name)));
drop policy if exists "manager-kyc admin read" on storage.objects;
create policy "manager-kyc admin read" on storage.objects for select to authenticated
  using (bucket_id = 'manager-kyc' and public.is_admin());

-- vehicle-photos: owning driver (the vehicle's owner) read+write; everyone authenticated may read
-- (agents see a driver's car); admins read all
drop policy if exists "vehicle-photos owner write" on storage.objects;
create policy "vehicle-photos owner write" on storage.objects for all to authenticated
  using (bucket_id = 'vehicle-photos' and exists (
           select 1 from public.vehicles v where v.id = public.storage_owner_uuid(name) and (public.owns_driver(v.driver_id) or public.is_admin())))
  with check (bucket_id = 'vehicle-photos' and exists (
           select 1 from public.vehicles v where v.id = public.storage_owner_uuid(name) and (public.owns_driver(v.driver_id) or public.is_admin())));
drop policy if exists "vehicle-photos authed read" on storage.objects;
create policy "vehicle-photos authed read" on storage.objects for select to authenticated
  using (bucket_id = 'vehicle-photos');

-- video-recordings: admins only
drop policy if exists "video-recordings admin all" on storage.objects;
create policy "video-recordings admin all" on storage.objects for all to authenticated
  using (bucket_id = 'video-recordings' and public.is_admin())
  with check (bucket_id = 'video-recordings' and public.is_admin());

analyze;
