-- 042_referral_attribution.sql
-- Stage 1 of the referral program. Adds:
--   * users.referral_code     — TEXT UNIQUE, auto-generated 8-char Crockford base32 at insert
--   * users.referred_by_user_id — UUID FK users(id), set once at signup, immutable thereafter
--                                 (block self-referral via CHECK + trigger)
-- Plus indexes + a one-shot backfill that issues a code to every existing user.
--
-- See docs/REFERRAL_PROGRAM_REQUIREMENTS.md §1, §2, §6 and
--     docs/REFERRAL_IMPLEMENTATION_PLAN.md Stage 1.
--
-- This migration is NOT idempotent on the columns themselves (uses ADD COLUMN); the
-- supporting functions/triggers use CREATE OR REPLACE so re-running is safe after
-- a failure mid-way is corrected.

------------------------------------------------------------------------------
-- 1. Columns
------------------------------------------------------------------------------

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS referral_code         TEXT,
  ADD COLUMN IF NOT EXISTS referred_by_user_id   UUID REFERENCES public.users(id) ON DELETE SET NULL;

-- self-referral is forbidden (also enforced in the trigger below for clearer errors)
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_no_self_referral;
ALTER TABLE public.users
  ADD CONSTRAINT users_no_self_referral CHECK (referred_by_user_id IS NULL OR referred_by_user_id <> id);

------------------------------------------------------------------------------
-- 2. Code generation — Crockford base32, 8 chars, retry-on-collision
------------------------------------------------------------------------------
-- Crockford base32 excludes I, L, O, U to avoid look-alike confusion with 1/0
-- and avoid forming offensive words. 32^8 = ~1.1 trillion possibilities — plenty
-- of headroom even at 100M users.

CREATE OR REPLACE FUNCTION public.generate_referral_code(_length INT DEFAULT 8)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  charset TEXT := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  result  TEXT := '';
  i       INT;
  rnd     INT;
BEGIN
  FOR i IN 1.._length LOOP
    rnd := floor(random() * length(charset))::INT + 1;
    result := result || substr(charset, rnd, 1);
  END LOOP;
  RETURN result;
END;
$$;

------------------------------------------------------------------------------
-- 3. Trigger: assign a unique referral_code at insert if not provided
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  attempts INT := 0;
  candidate TEXT;
BEGIN
  IF NEW.referral_code IS NOT NULL AND length(NEW.referral_code) > 0 THEN
    RETURN NEW; -- caller (or backfill) supplied one; leave it alone
  END IF;

  LOOP
    candidate := public.generate_referral_code(8);
    -- collision check; we hold no lock so it's possible to race, but the UNIQUE
    -- index is the final arbiter — on its violation we retry up to 5 times.
    PERFORM 1 FROM public.users WHERE referral_code = candidate LIMIT 1;
    IF NOT FOUND THEN
      NEW.referral_code := candidate;
      RETURN NEW;
    END IF;
    attempts := attempts + 1;
    IF attempts >= 5 THEN
      -- vanishingly unlikely; surface so we don't silently store a NULL
      RAISE EXCEPTION 'Could not generate a unique referral_code after 5 attempts';
    END IF;
  END LOOP;
END;
$$;

DROP TRIGGER IF EXISTS users_set_referral_code ON public.users;
CREATE TRIGGER users_set_referral_code
  BEFORE INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.set_referral_code();

------------------------------------------------------------------------------
-- 4. Trigger: referred_by_user_id is immutable once set + self-referral guard
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_referred_by()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- never allow self-referral (defence in depth on top of the CHECK)
  IF NEW.referred_by_user_id IS NOT NULL AND NEW.referred_by_user_id = NEW.id THEN
    RAISE EXCEPTION 'SELF_REFERRAL_FORBIDDEN: a user cannot refer themselves';
  END IF;

  -- once set to a non-null value, it cannot be changed or cleared
  IF TG_OP = 'UPDATE' THEN
    IF OLD.referred_by_user_id IS NOT NULL
       AND (NEW.referred_by_user_id IS DISTINCT FROM OLD.referred_by_user_id) THEN
      RAISE EXCEPTION 'REFERRED_BY_IMMUTABLE: referred_by_user_id cannot be changed once set (was %, attempted %)',
        OLD.referred_by_user_id, NEW.referred_by_user_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_guard_referred_by ON public.users;
CREATE TRIGGER users_guard_referred_by
  BEFORE INSERT OR UPDATE OF referred_by_user_id ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_referred_by();

------------------------------------------------------------------------------
-- 5. Backfill: every existing user without a code gets one
------------------------------------------------------------------------------
-- One row at a time so the trigger runs and uniqueness is honoured.

-- Generate codes directly with retries (the BEFORE INSERT trigger only fires on inserts).
DO $$
DECLARE
  uid UUID;
  candidate TEXT;
  attempts INT;
BEGIN
  FOR uid IN SELECT id FROM public.users WHERE referral_code IS NULL LOOP
    attempts := 0;
    LOOP
      candidate := public.generate_referral_code(8);
      BEGIN
        UPDATE public.users SET referral_code = candidate WHERE id = uid;
        EXIT; -- success
      EXCEPTION WHEN unique_violation THEN
        attempts := attempts + 1;
        IF attempts >= 5 THEN
          RAISE EXCEPTION 'Backfill: could not assign unique referral_code to user % after 5 attempts', uid;
        END IF;
      END;
    END LOOP;
  END LOOP;
END;
$$;

------------------------------------------------------------------------------
-- 6. NOT NULL + UNIQUE indexes (after backfill so the NOT NULL holds)
------------------------------------------------------------------------------

ALTER TABLE public.users
  ALTER COLUMN referral_code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code_uq
  ON public.users (referral_code);

CREATE INDEX IF NOT EXISTS users_referred_by_user_id_idx
  ON public.users (referred_by_user_id)
  WHERE referred_by_user_id IS NOT NULL;

------------------------------------------------------------------------------
-- 7. Comment for posterity
------------------------------------------------------------------------------

COMMENT ON COLUMN public.users.referral_code IS
  'Unique 8-char Crockford-base32 code shared at signup to attribute new users to this referrer. Auto-generated by users_set_referral_code trigger; immutable.';
COMMENT ON COLUMN public.users.referred_by_user_id IS
  'The user who referred this account (FK to users.id). Set ONCE at signup via /auth/verify-otp; immutable thereafter (enforced by users_guard_referred_by trigger). Never points to self.';

ANALYZE public.users;
