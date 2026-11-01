-- Test fixture: the hosted AI-generation quota objects (chatbot_usage and its
-- RPCs, shape from mobile-app 20260621000000_fix_chatbot_usage_counting.sql),
-- rigged as a tripwire. Every call is recorded in quota_tripwire_calls and the
-- check answers "limit reached". The task action endpoint must never call them.
create table public.chatbot_usage (
  user_id uuid primary key references auth.users(id) on delete cascade,
  message_count integer not null default 0,
  last_message_at timestamptz,
  total_tokens_used bigint not null default 0,
  total_estimated_cost_usd double precision not null default 0
);
alter table public.chatbot_usage enable row level security;
create table public.quota_tripwire_calls (
  id bigint generated always as identity primary key,
  fn text not null,
  called_at timestamptz not null default now()
);
create function public.check_and_increment_chatbot_usage(p_user_id uuid, p_daily_limit integer default 6)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into public.quota_tripwire_calls (fn) values ('check_and_increment_chatbot_usage');
  return false;
end $$;
create function public.increment_chatbot_usage(p_user_id uuid, p_tokens bigint default 0, p_cost double precision default 0)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.quota_tripwire_calls (fn) values ('increment_chatbot_usage');
end $$;
create function public.refund_chatbot_message(p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.quota_tripwire_calls (fn) values ('refund_chatbot_message');
end $$;
