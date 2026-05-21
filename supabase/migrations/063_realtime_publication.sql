-- Realtime publication for the live agent surfaces (PR: realtime-agent-surfaces).
--
-- The browser subscribes to row changes on these four tables purely as a
-- "something changed, refetch now" SIGNAL — the payload is ignored; all rendered
-- data still comes through the REST API + edge-function transforms/redaction
-- (architecture rule #1 preserved; the carve-out is documented in CLAUDE.md).
--
-- Realtime enforces RLS on the subscribing connection, so:
--   • trip_acceptances → an agent sees applicants for THEIR trips only
--     (SELECT policy: owns_driver(driver_id) OR owns_trip(trip_id) OR is_admin()).
--   • notifications    → each user sees only their own (user_id = auth.uid()).
--   • trips / vacancies have public SELECT (using(true)); the client also pins a
--     server-side channel filter (posted_by_user_id=eq.<userId>) on trips so an
--     agent only receives their own trips' events.
--
-- REPLICA IDENTITY FULL is required so UPDATE/DELETE events carry the old row
-- (Realtime needs it to evaluate RLS + emit the previous values).

alter publication supabase_realtime add table public.trips;
alter publication supabase_realtime add table public.trip_acceptances;
alter publication supabase_realtime add table public.vacancies;
alter publication supabase_realtime add table public.notifications;

alter table public.trips             replica identity full;
alter table public.trip_acceptances  replica identity full;
alter table public.vacancies         replica identity full;
alter table public.notifications     replica identity full;
