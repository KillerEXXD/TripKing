-- Tighten can_reveal_agent: only reveal the agent's PII to a driver who was actually
-- picked for the trip (acceptance status 'selected' or 'accepted'), not to every applicant.
--
-- Original predicate (022_display_handles_and_pii_log.sql) returned true as soon as ANY
-- trip_acceptances row existed for the (driver, agent) pair — so a merely-applied or
-- rejected driver could still see the agent's name/phone via GET /trips/:id.
-- Admins and self-view continue to reveal as before.

create or replace function public.can_reveal_agent(p_viewer uuid, p_agent_user uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when p_viewer is null or p_agent_user is null then false
    when p_viewer = p_agent_user then true
    when exists (select 1 from public.users where id = p_viewer and role = 'admin') then true
    when exists (
      select 1
      from public.trip_acceptances ta
      join public.drivers d on d.id = ta.driver_id and d.user_id = p_viewer
      join public.trips    t on t.id = ta.trip_id   and t.posted_by_user_id = p_agent_user
      where ta.status in ('selected', 'accepted')
    ) then true
    else false
  end;
$$;

grant execute on function public.can_reveal_agent (uuid, uuid) to authenticated, service_role;
