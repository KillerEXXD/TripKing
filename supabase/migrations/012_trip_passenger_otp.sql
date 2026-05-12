-- TripKing — migration 012: store the plaintext passenger OTP alongside the hash.
-- POST /trips/:id/assign generates a 6-digit OTP and stores its SHA-256 in `passenger_otp_hash`
-- (used by /start verification and the /trips/by-otp lookup). The trip POSTER needs to be able to
-- re-open the passenger-portal link (`…/passenger/<otp>`) any time — not only at the instant of
-- assignment — so we also keep the plaintext here. It's echoed on GET /trips/:id ONLY to the
-- poster (auth.uid() = posted_by_user_id) or an admin; never to anyone else, never the hash.
-- (Pre-existing trips keep only the hash — their poster won't see the OTP until they re-assign.)
alter table public.trips add column passenger_otp text;
