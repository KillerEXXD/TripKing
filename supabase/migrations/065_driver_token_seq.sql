-- Global driver token sequence (PR1 schema; BEHAVIOUR-NEUTRAL).
--
-- The hidden, monotonic join-order number a driver gets when they go "I'm
-- Online" in Auto-dispatch (driver_presence.token = nextval here). Race-free;
-- never shown to the driver (they only ever see a location-relative "X of N
-- nearby"). No consumer yet — the presence engine lands in a later PR.

create sequence if not exists public.driver_token_seq;
