-- Store one editable review per learner and lesson. No anonymous access.
create table public.lesson_reviews (
  user_id uuid not null references auth.users(id) on delete cascade,
  sanity_lesson_id text not null check (length(sanity_lesson_id) between 1 and 200),
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (length(comment) <= 2000),
  updated_at timestamptz not null default now(),
  primary key (user_id, sanity_lesson_id)
);
alter table public.lesson_reviews enable row level security;
revoke all on public.lesson_reviews from anon;
grant select, insert, update on public.lesson_reviews to authenticated;
create policy lesson_reviews_select_own on public.lesson_reviews for select to authenticated
  using ((select auth.uid()) = user_id);
create policy lesson_reviews_insert_own on public.lesson_reviews for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy lesson_reviews_update_own on public.lesson_reviews for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Preserve all existing page types and permit ending-page resume.
alter table public.user_lesson_progress
  drop constraint user_lesson_progress_current_page_type_check;
alter table public.user_lesson_progress
  add constraint user_lesson_progress_current_page_type_check
  check (current_page_type in ('intro', 'lesson', 'activity', 'quiz', 'ending'));
