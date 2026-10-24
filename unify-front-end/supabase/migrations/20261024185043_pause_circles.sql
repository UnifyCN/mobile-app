-- Retain Circle data, existing policies, function bodies, and cron schedules.
-- The admin switch restores the cron activity recorded at the first pause.
create table public.circles_feature_state (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null,
  paused_at timestamptz,
  saved_jobs jsonb not null default '{}'::jsonb
);
alter table public.circles_feature_state enable row level security;
revoke all on public.circles_feature_state from public, anon, authenticated, service_role;
insert into public.circles_feature_state (enabled) values (true);

create function public.circles_feature_enabled()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select enabled from public.circles_feature_state where singleton), false);
$$;
revoke all on function public.circles_feature_enabled() from public;
grant execute on function public.circles_feature_enabled() to anon, authenticated, service_role;

create function public.is_circle_notification(_type text, _data jsonb)
returns boolean
language sql immutable
set search_path = ''
as $$
  select coalesce(_type in ('circle_matched', 'circle_ending_soon', 'circle_ended', 'new_message'), false)
    or coalesce(_data ? 'circle_id', false);
$$;
revoke all on function public.is_circle_notification(text, jsonb) from public;
grant execute on function public.is_circle_notification(text, jsonb) to anon, authenticated, service_role;

create function public.set_circles_enabled(_enabled boolean)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  _state public.circles_feature_state;
  _job record;
begin
  if _enabled is null then
    raise exception 'The enabled value is required';
  end if;
  select * into strict _state from public.circles_feature_state where singleton for update;
  if _state.enabled = _enabled then
    return;
  end if;

  if not _enabled then
    select coalesce(jsonb_object_agg(jobname, active), '{}'::jsonb) into _state.saved_jobs
    from cron.job
    where jobname in ('community-matching-schedule', 'community-matching-cron', 'close-expired-circles');
  end if;

  update public.circles_feature_state
  set enabled = _enabled,
      paused_at = case when _enabled then null else now() end,
      saved_jobs = _state.saved_jobs
  where singleton;

  for _job in
    select jobid, jobname from cron.job
    where jobname in ('community-matching-schedule', 'community-matching-cron', 'close-expired-circles')
  loop
    perform cron.alter_job(
      job_id := _job.jobid,
      active := case when _enabled then coalesce((_state.saved_jobs->>_job.jobname)::boolean, false) else false end
    );
  end loop;
end;
$$;
revoke all on function public.set_circles_enabled(boolean) from public, anon, authenticated, service_role;
grant execute on function public.set_circles_enabled(boolean) to postgres;

-- Restrictive policies combine with, and do not replace, membership policies.
do $$
declare
  _table text;
begin
  foreach _table in array array[
    'community_circles', 'community_circle_members', 'community_match_waitlist',
    'community_match_history', 'community_messages', 'community_matching_runs'
  ] loop
    execute format(
      'create policy circles_feature_gate on public.%I as restrictive for all to anon, authenticated
       using ((select public.circles_feature_enabled()))
       with check ((select public.circles_feature_enabled()))', _table
    );
  end loop;
end;
$$;

create policy circles_notification_gate on public.community_notifications
as restrictive for all to anon, authenticated
using ((select public.circles_feature_enabled()) or not public.is_circle_notification(type, data))
with check ((select public.circles_feature_enabled()) or not public.is_circle_notification(type, data));

-- Also stop service-role writes from requests that started before the pause.
-- Leave DELETE cascades available for account deletion.
create function public.guard_circles_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.circles_feature_enabled() then
    return new;
  end if;
  if tg_table_name = 'community_notifications' then
    if not public.is_circle_notification(new.type, new.data) then
      if tg_op = 'INSERT' then
        return new;
      elsif not public.is_circle_notification(old.type, old.data) then
        return new;
      end if;
    end if;
  end if;
  raise exception 'Circles are paused' using errcode = '55000';
end;
$$;
revoke all on function public.guard_circles_write() from public, anon, authenticated, service_role;

do $$
declare
  _table text;
begin
  foreach _table in array array[
    'community_circles', 'community_circle_members', 'community_match_waitlist',
    'community_match_history', 'community_messages', 'community_matching_runs',
    'community_notifications'
  ] loop
    execute format(
      'create trigger circles_write_gate before insert or update on public.%I
       for each row execute function public.guard_circles_write()', _table
    );
  end loop;
end;
$$;

-- Preserve each existing RPC body and ACL. Add the check before its first action.
-- This covers security-definer RPCs, the HTTP scheduler, and the deletion worker.
do $$
declare
  _function record;
  _definition text;
  _guarded text;
  _count integer := 0;
begin
  for _function in
    select p.oid, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    where n.nspname = 'public' and l.lanname = 'plpgsql'
      and p.proname in ('join_community_waitlist', 'create_circle_match',
        'close_expired_circles_cron', 'delete_expired_community_circles', 'trigger_matchmake_circles')
  loop
    _definition := pg_get_functiondef(_function.oid);
    _guarded := regexp_replace(_definition, '\mbegin\M',
      'begin
  if not public.circles_feature_enabled() then
    raise exception ''Circles are paused'' using errcode = ''55000'';
  end if;', 'i');
    if _guarded = _definition then
      raise exception 'Cannot guard Circle function %', _function.proname;
    end if;
    execute _guarded;
    _count := _count + 1;
  end loop;
  if _count <> 5 then
    raise exception 'Expected five Circle functions, found %', _count;
  end if;
end;
$$;

create or replace function public.get_my_circle_ids()
returns table(circle_id uuid)
language sql security definer
set search_path = ''
as $$
  select circle_id from public.community_circle_members
  where public.circles_feature_enabled() and user_id = auth.uid() and left_at is null;
$$;

select public.set_circles_enabled(false);
