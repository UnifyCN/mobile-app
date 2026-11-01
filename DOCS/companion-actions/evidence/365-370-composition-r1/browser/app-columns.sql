-- Disposable stack only (unify-compose-details-370-r1): columns the real web app reads that the
-- hosted-shape test baseline leaves out. Never committed, never hosted.
alter table public.conversations add column if not exists updated_at timestamptz default now();
create policy "browser365 update own conversations" on public.conversations
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter table public.messages add column if not exists sources jsonb;
alter table public.messages add column if not exists suggested_next_steps jsonb;
alter table public.messages add column if not exists companion_context jsonb;
alter table public.users add column if not exists username text, add column if not exists first_name text,
  add column if not exists profile_picture_url text, add column if not exists is_premium boolean default false,
  add column if not exists permissions text[], add column if not exists biography text,
  add column if not exists pronouns text, add column if not exists created_at timestamptz default now(),
  add column if not exists privacy_policy_accepted_at timestamptz;
create policy "browser365 read own user" on public.users for select to authenticated using ((select auth.uid()) = id);
alter table public.users enable row level security;
alter table public.user_onboarding_profiles add column if not exists referral_source text,
  add column if not exists goals text[], add column if not exists learning_interests text[],
  add column if not exists hobbies text[], add column if not exists preferred_language text,
  add column if not exists onboarding_completed boolean default true;
create table if not exists public.user_followers (follower_id uuid, following_id uuid);
alter table public.user_followers enable row level security;
create policy "browser365 read followers" on public.user_followers for select to authenticated using (true);
grant select on public.user_followers to authenticated;
notify pgrst, 'reload schema';
