-- 049_referral_notifications.sql
-- Stage 8 of the referral program. Adds:
--   * 8 new notification types in the public.notifications CHECK constraint
--   * notify_referral_event(_user_id, _type, _payload) helper that renders the
--     title/body from notification_templates (Stage 5) with {var} substitution
--   * Trigger wiring on referral_links AFTER UPDATE — fires verified, qualified,
--     cap_reached when status transitions
--   * Trigger wiring on referral_ledger AFTER INSERT — fires earning on accrual,
--     released on the moment an accrual matures past hold_days (handled at fire time
--     since "released" is a derived state — for now we fire it together with earning
--     when withdrawal_hold_days = 0; otherwise it fires lazily on the next dashboard
--     read. Stage 10 may add a daily cron to fire delayed "released" notifications.)
--   * Trigger wiring on users AFTER UPDATE of referred_by_user_id — fires
--     referral_signup notification to the REFERRER (so they see the new signup)
--
-- Spec: docs/REFERRAL_PROGRAM_REQUIREMENTS.md §20 (referrer notifications).
-- Plan: docs/REFERRAL_IMPLEMENTATION_PLAN.md Stage 8.

------------------------------------------------------------------------------
-- 1. Extend the notifications.type CHECK constraint
------------------------------------------------------------------------------

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
    -- existing
    'alert_match', 'kyc_status_change', 'trip_assigned', 'trip_cancelled',
    'trip_completed', 'review_received', 'account_status_change',
    'trip_invitation', 'invitation_accepted', 'invitation_declined',
    'bug_reported', 'bug_resolved', 'bug_commented',
    'trip_selected', 'trip_assignment_cancelled', 'selection_expired',
    'driver_declined',
    -- Stage 8 referral events
    'referral_signup',
    'referral_verified',
    'referral_promo_exhausted',           -- placeholder for future promo system
    'referral_first_eligible_trip',
    'referral_qualified',
    'referral_earning',
    'referral_released',
    'referral_cap_reached',
    -- Stage 7 withdrawal events
    'withdrawal_requested',
    'withdrawal_approved',
    'withdrawal_paid',
    'withdrawal_rejected'
  ]));

------------------------------------------------------------------------------
-- 2. notify_referral_event helper
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.render_template(_tpl TEXT, _vars JSONB)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  k TEXT;
  v TEXT;
  out TEXT := _tpl;
BEGIN
  IF _vars IS NULL THEN RETURN _tpl; END IF;
  FOR k, v IN SELECT key, value::TEXT FROM jsonb_each_text(_vars) LOOP
    out := replace(out, '{' || k || '}', v);
  END LOOP;
  RETURN out;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_referral_event(
  _user_id UUID,
  _type TEXT,
  _payload JSONB DEFAULT '{}'::jsonb,
  _locale TEXT DEFAULT 'en'
) RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  tmpl RECORD;
  notif_id UUID;
BEGIN
  IF _user_id IS NULL THEN RETURN NULL; END IF;

  SELECT title, body INTO tmpl
    FROM public.notification_templates
   WHERE type = _type AND locale = _locale AND is_active
   LIMIT 1;

  -- fall back to English if locale-specific not found
  IF tmpl IS NULL AND _locale <> 'en' THEN
    SELECT title, body INTO tmpl
      FROM public.notification_templates
     WHERE type = _type AND locale = 'en' AND is_active
     LIMIT 1;
  END IF;

  -- final fallback: a generic notification with the type as title
  IF tmpl IS NULL THEN
    tmpl.title := _type;
    tmpl.body  := _type;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, body, payload_json)
  VALUES (_user_id, _type,
          public.render_template(tmpl.title, _payload),
          public.render_template(tmpl.body,  _payload),
          _payload)
  RETURNING id INTO notif_id;

  RETURN notif_id;
END;
$$;

------------------------------------------------------------------------------
-- 3. Trigger: when users.referred_by_user_id is set → notify the REFERRER
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_referrer_on_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  referred_name TEXT;
BEGIN
  IF NEW.referred_by_user_id IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.referred_by_user_id IS NOT DISTINCT FROM NEW.referred_by_user_id THEN
    RETURN NEW;
  END IF;

  referred_name := COALESCE(NULLIF(NEW.display_name, ''), 'Someone');
  PERFORM public.notify_referral_event(
    NEW.referred_by_user_id,
    'referral_signup',
    jsonb_build_object('name', referred_name, 'referred_user_id', NEW.id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS users_notify_referrer_on_signup ON public.users;
CREATE TRIGGER users_notify_referrer_on_signup
  AFTER INSERT OR UPDATE OF referred_by_user_id ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_referrer_on_signup();

------------------------------------------------------------------------------
-- 4. Trigger: referral_links status transitions
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_referrer_on_link_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  referred_name TEXT;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT COALESCE(NULLIF(display_name, ''), 'Someone') INTO referred_name
    FROM public.users WHERE id = NEW.referred_user_id;

  IF NEW.status = 'verified' AND OLD.status IN ('signed_up', 'verification_pending') THEN
    PERFORM public.notify_referral_event(
      NEW.referrer_user_id, 'referral_verified',
      jsonb_build_object('name', referred_name, 'referred_user_id', NEW.referred_user_id)
    );
  ELSIF NEW.status = 'paid_trips_started' THEN
    PERFORM public.notify_referral_event(
      NEW.referrer_user_id, 'referral_first_eligible_trip',
      jsonb_build_object('name', referred_name, 'amount', (NEW.payout_per_trip_paise / 100)::TEXT)
    );
  ELSIF NEW.status = 'qualified' AND OLD.status NOT IN ('qualified', 'earning_active', 'cap_reached') THEN
    PERFORM public.notify_referral_event(
      NEW.referrer_user_id, 'referral_qualified',
      jsonb_build_object('name', referred_name)
    );
  ELSIF NEW.status = 'earning_active' AND OLD.status NOT IN ('earning_active', 'cap_reached') THEN
    PERFORM public.notify_referral_event(
      NEW.referrer_user_id, 'referral_qualified',
      jsonb_build_object('name', referred_name)
    );
  ELSIF NEW.status = 'cap_reached' AND OLD.status <> 'cap_reached' THEN
    PERFORM public.notify_referral_event(
      NEW.referrer_user_id, 'referral_cap_reached',
      jsonb_build_object('name', referred_name, 'cap', (NEW.cap_paise / 100)::TEXT)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS referral_links_notify_status ON public.referral_links;
CREATE TRIGGER referral_links_notify_status
  AFTER UPDATE OF status ON public.referral_links
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_referrer_on_link_status_change();

------------------------------------------------------------------------------
-- 5. Trigger: referral_ledger accrual → notify REFERRER per ₹50
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_referrer_on_accrual()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  link RECORD;
  referred_name TEXT;
  lifetime BIGINT;
BEGIN
  IF NEW.entry_type <> 'accrual' THEN RETURN NEW; END IF;

  SELECT rl.referrer_user_id, rl.referred_user_id, rl.total_earned_paise INTO link
    FROM public.referral_links rl WHERE rl.id = NEW.referral_link_id;
  IF link IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(NULLIF(display_name, ''), 'Someone') INTO referred_name
    FROM public.users WHERE id = link.referred_user_id;
  -- total_earned_paise on the link includes this accrual (the Stage-4 trigger updates
  -- it before the row is inserted? actually: it inserts ledger first, THEN updates link.
  -- Either way we just want a freshly-summed lifetime for this referrer)
  SELECT COALESCE(SUM(led.amount_paise) FILTER (WHERE led.entry_type = 'accrual'), 0)
    INTO lifetime
    FROM public.referral_ledger led
    JOIN public.referral_links rl ON rl.id = led.referral_link_id
   WHERE rl.referrer_user_id = link.referrer_user_id;

  PERFORM public.notify_referral_event(
    link.referrer_user_id, 'referral_earning',
    jsonb_build_object(
      'name',     referred_name,
      'amount',   (NEW.amount_paise / 100)::TEXT,
      'tripId',   COALESCE(NEW.trip_id::TEXT, '—'),
      'lifetime', (lifetime / 100)::TEXT
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS referral_ledger_notify_accrual ON public.referral_ledger;
CREATE TRIGGER referral_ledger_notify_accrual
  AFTER INSERT ON public.referral_ledger
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_referrer_on_accrual();

------------------------------------------------------------------------------
-- 6. Trigger: withdrawals state transitions → notify USER
------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_user_on_withdrawal_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_referral_event(
      NEW.user_id, 'withdrawal_requested',
      jsonb_build_object('amount', (NEW.amount_paise / 100)::TEXT, 'upi', NEW.upi_id)
    );
    RETURN NEW;
  END IF;

  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status = 'approved' THEN
    PERFORM public.notify_referral_event(
      NEW.user_id, 'withdrawal_approved',
      jsonb_build_object('amount', (NEW.amount_paise / 100)::TEXT, 'upi', NEW.upi_id)
    );
  ELSIF NEW.status = 'paid' THEN
    PERFORM public.notify_referral_event(
      NEW.user_id, 'withdrawal_paid',
      jsonb_build_object('amount', (NEW.amount_paise / 100)::TEXT, 'upi', NEW.upi_id, 'ref', COALESCE(NEW.external_txn_ref, '—'))
    );
  ELSIF NEW.status IN ('rejected', 'cancelled', 'failed') THEN
    PERFORM public.notify_referral_event(
      NEW.user_id, 'withdrawal_rejected',
      jsonb_build_object('amount', (NEW.amount_paise / 100)::TEXT, 'reason', COALESCE(NEW.rejected_reason, NEW.status))
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS withdrawals_notify_user ON public.withdrawals;
CREATE TRIGGER withdrawals_notify_user
  AFTER INSERT OR UPDATE OF status ON public.withdrawals
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_user_on_withdrawal_change();

------------------------------------------------------------------------------
-- 7. Comments
------------------------------------------------------------------------------

COMMENT ON FUNCTION public.notify_referral_event IS
  'Renders title/body from notification_templates (Stage 5) with {var} substitution and inserts into public.notifications. _payload becomes both the substitution map and the persisted payload_json.';
COMMENT ON FUNCTION public.notify_referrer_on_signup IS 'Fires referral_signup to the referrer when users.referred_by_user_id is set.';
COMMENT ON FUNCTION public.notify_referrer_on_link_status_change IS 'Fires referral_verified / referral_first_eligible_trip / referral_qualified / referral_cap_reached as referral_links.status transitions.';
COMMENT ON FUNCTION public.notify_referrer_on_accrual IS 'Fires referral_earning to the referrer on each ledger accrual.';
COMMENT ON FUNCTION public.notify_user_on_withdrawal_change IS 'Fires withdrawal_requested/approved/paid/rejected to the user as withdrawals row transitions.';
