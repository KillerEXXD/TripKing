-- 062_design_feedback.sql
-- In-app feedback collection for the /v2..v7 design prototypes.
-- One row per submission (a single reviewer's full questionnaire).
-- Admin-only via RLS; consumed by /admin/design-feedback.

create table if not exists public.design_feedback (
  id                uuid        primary key default gen_random_uuid(),
  reviewer_user_id  uuid        references public.users(id) on delete set null,
  reviewer_name     text        not null,
  submitted_at      timestamptz not null default now(),
  -- jsonb payloads — schema validated client-side + by the edge function's Zod
  -- before insert, but kept loose at the DB level so question-set evolutions
  -- don't need a migration.
  preferences       jsonb       not null default '{}'::jsonb,
  sus_scores        jsonb       not null default '{}'::jsonb,
  cross_page        jsonb       not null default '{}'::jsonb,
  notes             text,
  constraint reviewer_name_not_blank check (length(btrim(reviewer_name)) > 0)
);

create index if not exists design_feedback_submitted_at_idx
  on public.design_feedback (submitted_at desc);

alter table public.design_feedback enable row level security;

-- Admin role only — same pattern as other admin-managed tables (see
-- bug_reports / admin_audit_log policies). Reads + writes gated.
drop policy if exists design_feedback_admin_all on public.design_feedback;
create policy design_feedback_admin_all on public.design_feedback
  for all
  to authenticated
  using ((select role from public.users where id = auth.uid()) = 'admin')
  with check ((select role from public.users where id = auth.uid()) = 'admin');
