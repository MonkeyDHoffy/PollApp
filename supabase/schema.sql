-- PollApp Supabase schema
-- IMPORTANT:
-- 1. Execute this file manually in the Supabase SQL Editor.
-- 2. If this file changes later, the same changes must be applied again in Supabase.
-- 3. This file is the repo reference for the current database schema.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.surveys (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) >= 1),
  description text,
  category text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  visibility text not null default 'public' check (visibility in ('public', 'private')),
  share_token text not null default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  access_code text,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.surveys
  add column if not exists visibility text not null default 'public' check (visibility in ('public', 'private'));

alter table public.surveys
  add column if not exists share_token text not null default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);

alter table public.surveys
  add column if not exists access_code text;

create table if not exists public.survey_questions (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  question_text text not null check (char_length(question_text) >= 1),
  question_type text not null default 'multiple_choice' check (question_type in ('multiple_choice', 'checkboxes')),
  allow_multiple boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.survey_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.survey_questions(id) on delete cascade,
  answer_text text not null check (char_length(answer_text) >= 1),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys(id) on delete cascade,
  respondent_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.survey_response_answers (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.survey_responses(id) on delete cascade,
  question_id uuid not null references public.survey_questions(id) on delete cascade,
  answer_id uuid not null references public.survey_answers(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (response_id, question_id, answer_id)
);

create index if not exists idx_surveys_creator_id on public.surveys(creator_id);
create index if not exists idx_surveys_status on public.surveys(status);
create unique index if not exists idx_surveys_share_token on public.surveys(share_token);
create index if not exists idx_surveys_visibility on public.surveys(visibility);
create index if not exists idx_surveys_created_at on public.surveys(created_at desc);
create index if not exists idx_survey_questions_survey_id on public.survey_questions(survey_id);
create index if not exists idx_survey_answers_question_id on public.survey_answers(question_id);
create index if not exists idx_survey_responses_survey_id on public.survey_responses(survey_id);
create index if not exists idx_survey_response_answers_response_id on public.survey_response_answers(response_id);

drop trigger if exists set_surveys_updated_at on public.surveys;
create trigger set_surveys_updated_at
before update on public.surveys
for each row
execute function public.set_updated_at();

alter table public.surveys enable row level security;
alter table public.survey_questions enable row level security;
alter table public.survey_answers enable row level security;
alter table public.survey_responses enable row level security;
alter table public.survey_response_answers enable row level security;

drop policy if exists "surveys_select_published_or_own" on public.surveys;
create policy "surveys_select_published_or_own"
on public.surveys
for select
using (
  status = 'published'
  or auth.uid() = creator_id
);

drop policy if exists "surveys_insert_own" on public.surveys;
create policy "surveys_insert_own"
on public.surveys
for insert
with check (
  auth.uid() = creator_id
);

drop policy if exists "surveys_update_own" on public.surveys;
create policy "surveys_update_own"
on public.surveys
for update
using (
  auth.uid() = creator_id
)
with check (
  auth.uid() = creator_id
);

drop policy if exists "surveys_delete_own" on public.surveys;
create policy "surveys_delete_own"
on public.surveys
for delete
using (
  auth.uid() = creator_id
);

drop policy if exists "questions_select_by_visible_survey" on public.survey_questions;
create policy "questions_select_by_visible_survey"
on public.survey_questions
for select
using (
  exists (
    select 1
    from public.surveys s
    where s.id = survey_id
      and (s.status = 'published' or s.creator_id = auth.uid())
  )
);

drop policy if exists "questions_insert_by_owner" on public.survey_questions;
create policy "questions_insert_by_owner"
on public.survey_questions
for insert
with check (
  exists (
    select 1
    from public.surveys s
    where s.id = survey_id
      and s.creator_id = auth.uid()
  )
);

drop policy if exists "questions_update_by_owner" on public.survey_questions;
create policy "questions_update_by_owner"
on public.survey_questions
for update
using (
  exists (
    select 1
    from public.surveys s
    where s.id = survey_id
      and s.creator_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.surveys s
    where s.id = survey_id
      and s.creator_id = auth.uid()
  )
);

drop policy if exists "questions_delete_by_owner" on public.survey_questions;
create policy "questions_delete_by_owner"
on public.survey_questions
for delete
using (
  exists (
    select 1
    from public.surveys s
    where s.id = survey_id
      and s.creator_id = auth.uid()
  )
);

drop policy if exists "answers_select_by_visible_survey" on public.survey_answers;
create policy "answers_select_by_visible_survey"
on public.survey_answers
for select
using (
  exists (
    select 1
    from public.survey_questions q
    join public.surveys s on s.id = q.survey_id
    where q.id = question_id
      and (s.status = 'published' or s.creator_id = auth.uid())
  )
);

drop policy if exists "answers_insert_by_owner" on public.survey_answers;
create policy "answers_insert_by_owner"
on public.survey_answers
for insert
with check (
  exists (
    select 1
    from public.survey_questions q
    join public.surveys s on s.id = q.survey_id
    where q.id = question_id
      and s.creator_id = auth.uid()
  )
);

drop policy if exists "answers_update_by_owner" on public.survey_answers;
create policy "answers_update_by_owner"
on public.survey_answers
for update
using (
  exists (
    select 1
    from public.survey_questions q
    join public.surveys s on s.id = q.survey_id
    where q.id = question_id
      and s.creator_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.survey_questions q
    join public.surveys s on s.id = q.survey_id
    where q.id = question_id
      and s.creator_id = auth.uid()
  )
);

drop policy if exists "answers_delete_by_owner" on public.survey_answers;
create policy "answers_delete_by_owner"
on public.survey_answers
for delete
using (
  exists (
    select 1
    from public.survey_questions q
    join public.surveys s on s.id = q.survey_id
    where q.id = question_id
      and s.creator_id = auth.uid()
  )
);

drop policy if exists "responses_select_owner_or_creator" on public.survey_responses;
create policy "responses_select_owner_or_creator"
on public.survey_responses
for select
using (
  auth.uid() = respondent_id
  or exists (
    select 1
    from public.surveys s
    where s.id = survey_id
      and s.creator_id = auth.uid()
  )
);

drop policy if exists "responses_insert_published" on public.survey_responses;
create policy "responses_insert_published"
on public.survey_responses
for insert
with check (
  exists (
    select 1
    from public.surveys s
    where s.id = survey_id
      and s.status = 'published'
  )
);

drop policy if exists "response_answers_select_owner_or_creator" on public.survey_response_answers;
create policy "response_answers_select_owner_or_creator"
on public.survey_response_answers
for select
using (
  exists (
    select 1
    from public.survey_responses r
    join public.surveys s on s.id = r.survey_id
    where r.id = response_id
      and (
        r.respondent_id = auth.uid()
        or s.creator_id = auth.uid()
      )
  )
);

drop policy if exists "response_answers_insert_if_response_visible" on public.survey_response_answers;
create policy "response_answers_insert_if_response_visible"
on public.survey_response_answers
for insert
with check (
  exists (
    select 1
    from public.survey_responses r
    join public.surveys s on s.id = r.survey_id
    where r.id = response_id
      and s.status = 'published'
  )
);
