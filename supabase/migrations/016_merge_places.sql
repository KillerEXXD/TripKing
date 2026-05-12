-- TripKing — migration 016: merge_places(loser, winner) — the dedupe primitive behind POST /admin/places/:id/merge.
-- Repoints every *_place_id FK from the loser to the winner, then deletes the loser. Atomic (one txn).
-- Returns the number of FK rows repointed. security definer so the edge function (service role) can call it.
create or replace function public.merge_places(p_loser uuid, p_winner uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_n integer := 0; v_x integer;
begin
  if p_loser = p_winner then raise exception 'cannot merge a place into itself'; end if;
  if not exists (select 1 from public.places where id = p_loser)  then raise exception 'loser place % not found', p_loser; end if;
  if not exists (select 1 from public.places where id = p_winner) then raise exception 'winner place % not found', p_winner; end if;
  update public.vacancies            set current_place_id = p_winner where current_place_id = p_loser; get diagnostics v_x = row_count; v_n := v_n + v_x;
  update public.vacancy_destinations set place_id         = p_winner where place_id         = p_loser; get diagnostics v_x = row_count; v_n := v_n + v_x;
  update public.trips                set from_place_id    = p_winner where from_place_id    = p_loser; get diagnostics v_x = row_count; v_n := v_n + v_x;
  update public.trips                set to_place_id      = p_winner where to_place_id      = p_loser; get diagnostics v_x = row_count; v_n := v_n + v_x;
  update public.alerts               set from_place_id    = p_winner where from_place_id    = p_loser; get diagnostics v_x = row_count; v_n := v_n + v_x;
  update public.alerts               set to_place_id      = p_winner where to_place_id      = p_loser; get diagnostics v_x = row_count; v_n := v_n + v_x;
  update public.drivers              set current_place_id = p_winner where current_place_id = p_loser; get diagnostics v_x = row_count; v_n := v_n + v_x;
  update public.drivers              set home_place_id    = p_winner where home_place_id    = p_loser; get diagnostics v_x = row_count; v_n := v_n + v_x;
  delete from public.places where id = p_loser;
  return v_n;
end;
$$;
grant execute on function public.merge_places(uuid, uuid) to authenticated, anon, service_role;
