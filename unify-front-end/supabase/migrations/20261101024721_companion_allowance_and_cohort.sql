-- Read the existing server-owned counter. No new quota or entitlement policy.
-- Old generation and refund RPCs retain their signatures and permissions.
begin;
create function public.get_chatbot_allowance() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  observed timestamptz := statement_timestamp();
  premium boolean;
  used integer;
  last_message timestamptz;
begin
  if owner_id is null then raise insufficient_privilege using message = 'Authentication required'; end if;
  select coalesce(u.is_premium, false) into premium from public.users u where u.id = owner_id;
  if not found then raise insufficient_privilege using message = 'Account unavailable'; end if;
  select coalesce(c.message_count, 0), c.last_message_at into used, last_message
    from public.chatbot_usage c where c.user_id = owner_id;
  if not found or last_message is null or
    (last_message at time zone 'UTC')::date <> (observed at time zone 'UTC')::date then used := 0; end if;
  return jsonb_build_object(
    'message_count', greatest(0, used), 'last_message_at', last_message,
    'daily_limit', 6, 'remaining', case when premium then null else greatest(0, 6 - used) end,
    'is_premium', premium,
    'resets_at', ((observed at time zone 'UTC')::date + 1)::timestamp at time zone 'UTC',
    'observed_at', observed);
end $$;
revoke all on function public.get_chatbot_allowance() from public, anon;
grant execute on function public.get_chatbot_allowance() to authenticated;
comment on function public.get_chatbot_allowance() is 'Self-owned read of the existing six-per-UTC-day allowance; premium is uncapped. No client owner parameter.';

-- The service role reads this existing gate. Clients cannot configure cohorts.
alter table public.companion_feature_gate add column account_allowlist uuid[] not null default '{}';
notify pgrst, 'reload schema';
commit;
