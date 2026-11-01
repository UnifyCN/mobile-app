-- Simulator-run fixture only (#360). The full released app reads public.users and
-- public.user_onboarding_profiles before it shows the Checklist. Their hosted columns
-- were read (information_schema, read-only) on 2026-10-25; this adds them to the
-- baseline stack so the app can sign in and route to its tabs. Not part of the candidate.
alter table public.users
  add column username text, add column pronouns text, add column biography text,
  add column email varchar, add column created_at timestamptz default current_timestamp,
  add column updated_at timestamptz default current_timestamp, add column profile_picture_url text,
  add column is_premium boolean not null default false, add column permissions text not null default 'user',
  add column privacy_policy_accepted_at timestamptz, add column community_guidelines_accepted_at timestamptz,
  add column invite_code text, add column do_not_contact boolean not null default false,
  add column do_not_contact_at timestamptz, add column do_not_contact_reason text,
  add column first_name text, add column signup_source text;
alter table public.users enable row level security;
create policy "probe users read own" on public.users for select using (auth.uid() = id);
create policy "probe users update own" on public.users for update using (auth.uid() = id);
grant select, update on public.users to authenticated;

create type public.stage_enum as enum ('0', '1', '2', '3', '4');
create table public.user_onboarding_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  persona text, persona_other text, referral_source text, referral_source_other text,
  goals text[] default '{}', goals_other text, learning_interests text[] default '{}',
  learning_interests_other text, hobbies text[] default '{}', wants_reminders boolean default false,
  onboarding_completed boolean default false, onboarding_completed_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  arrival_date timestamptz, time_in_canada text, stage public.stage_enum, city text, province text,
  preferred_language text not null default 'en', welcome_email_sent_at timestamptz,
  welcome_email_attempts integer not null default 0, welcome_email_last_attempt_at timestamptz
);
alter table public.user_onboarding_profiles enable row level security;
create policy "Users can view own onboarding profile" on public.user_onboarding_profiles for select using (auth.uid() = id);
create policy "Users can create own onboarding profile" on public.user_onboarding_profiles for insert with check (auth.uid() = id);
create policy "Users can update own onboarding profile" on public.user_onboarding_profiles for update using (auth.uid() = id) with check (auth.uid() = id);
grant select, insert, update on public.user_onboarding_profiles to authenticated;
notify pgrst, 'reload schema';
