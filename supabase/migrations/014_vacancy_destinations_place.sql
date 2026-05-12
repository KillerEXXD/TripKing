-- TripKing — migration 014: a vacancy destination may reference a place (not only a curated city).
-- Phase C-2 of the maps-backed-locations epic. `vacancy_destinations` had PK (vacancy_id, city_id),
-- which forced every destination to be a curated city. Now: a surrogate `id` PK, `city_id` nullable,
-- and a CHECK that at least one of city_id / place_id is set — so a row can be a place, a city, or both.
alter table public.vacancy_destinations drop constraint vacancy_destinations_pkey;
alter table public.vacancy_destinations add column id uuid primary key default gen_random_uuid();
alter table public.vacancy_destinations alter column city_id drop not null;
alter table public.vacancy_destinations add constraint vacancy_destinations_loc_chk check (city_id is not null or place_id is not null);
create index if not exists idx_vacancy_destinations_vacancy on public.vacancy_destinations (vacancy_id);

analyze public.vacancy_destinations;
