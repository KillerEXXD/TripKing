-- TripKing — migration 022: admin-configurable cap on how many active vacancies a
-- driver may have at once. Default 2 (the value that was previously hardcoded in
-- supabase/functions/vacancies/index.ts). Bounded [1, 10] so an admin can't lock
-- everyone out (0) or defeat the purpose (1000). Soft enforcement only — a row
-- that's already active when the limit is lowered stays put; new POSTs see the
-- new ceiling, and any newly-freed slot is governed by it.
--
-- See: src/components/vacancy/IAmAvailableCard.tsx, supabase/functions/vacancies/index.ts.

alter table public.app_settings
  add column if not exists max_active_vacancies_per_driver integer
    not null default 2
    check (max_active_vacancies_per_driver between 1 and 10);

-- No data migration needed — the singleton row picks up DEFAULT 2 automatically.
analyze public.app_settings;
