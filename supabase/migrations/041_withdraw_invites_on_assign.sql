-- 041_withdraw_invites_on_assign.sql
--
-- When the agent selects a driver (trips.status: open|has_applicants → selected),
-- every other invitation on that trip becomes stale — the invited drivers can't
-- take it anymore. Atomically flip those rows to 'withdrawn' so:
--   * the driver's "Invited" tab (?invited=me filter, status IN pending/applied/declined) hides them
--   * pending_invitation_count (which counts only status='pending') drops to 0,
--     so the home "Invitations sent" card and the PostedTripCard "N invited" badge
--     stop counting them
--   * the agent's /trips/:id/invitations list naturally empties (UI filters withdrawn)
--
-- Mirrors the sync_trip_invitation_on_apply trigger pattern from migration 033.
-- Only fires on the first transition into 'selected' — re-opening a cancelled trip
-- won't resurrect / re-process old invites.

create or replace function public.withdraw_sibling_invites_on_assign() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status in ('open', 'has_applicants') and new.status = 'selected' then
    update public.trip_invitations
       set status = 'withdrawn', updated_at = now()
     where trip_id = new.id
       and status in ('pending', 'applied');
  end if;
  return new;
end;
$$;

drop trigger if exists trips_withdraw_sibling_invites_on_assign on public.trips;
create trigger trips_withdraw_sibling_invites_on_assign
  after update of status on public.trips
  for each row execute function public.withdraw_sibling_invites_on_assign();
