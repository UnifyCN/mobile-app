-- Mobile authority. Web mirrors this migration and rollback byte for byte.
-- New disabled worker role and private Auth session row-lock helper only.
-- No login, password, settings, schedule, or provider activation.
begin;
create role companion_push_worker nologin noinherit nosuperuser nocreatedb
  nocreaterole noreplication nobypassrls connection limit 4;
grant connect on database postgres to companion_push_worker;
grant usage on schema public, companion_push_private, companion_reminder_private
  to companion_push_worker;

-- No auth.sessions or auth.users table grant. No service_role membership.
-- postgres already has UPDATE on auth.sessions, but cannot grant UPDATE onward.
-- Reuse that existing privilege only inside this narrow, private function.
create function companion_push_private.lock_session_authorized(p_session uuid,p_user uuid)
returns boolean language plpgsql security definer
set search_path=pg_catalog,pg_temp as $$
begin
  perform 1 from auth.sessions where id=p_session and user_id=p_user for share;
  if not found then return false; end if;
  return companion_push_private.session_authorized(p_session,p_user);
end $$;
alter function companion_push_private.lock_session_authorized(uuid,uuid) owner to postgres;
revoke all on function companion_push_private.lock_session_authorized(uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function companion_push_private.lock_session_authorized(uuid,uuid),
  companion_push_private.session_authorized(uuid,uuid),
  public.companion_step_parent_lock(uuid,text),
  public.companion_step_parent(uuid,text)
  to companion_push_worker;

grant select on companion_push_private.settings, companion_push_private.enrollments,
  companion_push_private.deliveries, companion_push_private.budget,
  companion_reminder_private.events, public.companion_task_reminders,
  public.user_onboarding_profiles to companion_push_worker;
grant select(id,user_id,token) on public.push_tokens to companion_push_worker;
grant select(reminder_id) on companion_push_private.events to companion_push_worker;
grant select(id,delivery_id,outcome) on companion_push_private.attempts to companion_push_worker;

grant insert(reminder_id,user_id,task_ref,installation_id,generation,token_id,state)
  on companion_push_private.deliveries to companion_push_worker;
grant insert(reminder_id,user_id,reason) on companion_push_private.events to companion_push_worker;
grant insert(id,delivery_id,number) on companion_push_private.attempts to companion_push_worker;
grant update(state,attempt_count,ticket,ticket_at,receipt_check_at,next_attempt_at,receipt)
  on companion_push_private.deliveries to companion_push_worker;
grant update(reason) on companion_push_private.events to companion_push_worker;
grant update(outcome,ticket) on companion_push_private.attempts to companion_push_worker;
grant update(enabled,revision) on companion_push_private.enrollments to companion_push_worker;
grant update(second_at,minute_at,sends_second,sends_minute,receipts_minute,blocked_until)
  on companion_push_private.budget to companion_push_worker;

-- PostgreSQL requires UPDATE privilege for SELECT FOR SHARE / FOR UPDATE.
-- These column grants meet that rule. The UPDATE policies below reject writes.
grant update(singleton) on companion_push_private.settings to companion_push_worker;
grant update(due_at) on companion_reminder_private.events to companion_push_worker;
grant update(created_at) on public.companion_task_reminders to companion_push_worker;
grant update(updated_at) on public.push_tokens,public.user_onboarding_profiles to companion_push_worker;

-- Explicit cross-account service policies. RLS stays enabled.
create policy push_worker_select on companion_push_private.settings
  for select to companion_push_worker using(true);
create policy push_worker_select on companion_push_private.enrollments
  for select to companion_push_worker using(true);
create policy push_worker_select on companion_push_private.deliveries
  for select to companion_push_worker using(true);
create policy push_worker_select on companion_push_private.budget
  for select to companion_push_worker using(true);
create policy push_worker_select on companion_push_private.events
  for select to companion_push_worker using(true);
create policy push_worker_select on companion_push_private.attempts
  for select to companion_push_worker using(true);
create policy push_worker_select on companion_reminder_private.events
  for select to companion_push_worker using(true);
create policy push_worker_select on public.companion_task_reminders
  for select to companion_push_worker using(true);
create policy push_worker_select on public.push_tokens
  for select to companion_push_worker using(true);
create policy push_worker_select on public.user_onboarding_profiles
  for select to companion_push_worker using(true);

create policy push_worker_insert on companion_push_private.deliveries
  for insert to companion_push_worker with check(true);
create policy push_worker_insert on companion_push_private.events
  for insert to companion_push_worker with check(true);
create policy push_worker_insert on companion_push_private.attempts
  for insert to companion_push_worker with check(true);
create policy push_worker_update on companion_push_private.deliveries
  for update to companion_push_worker using(true) with check(true);
create policy push_worker_update on companion_push_private.events
  for update to companion_push_worker using(true) with check(true);
create policy push_worker_update on companion_push_private.attempts
  for update to companion_push_worker using(true) with check(true);
create policy push_worker_update on companion_push_private.enrollments
  for update to companion_push_worker using(true) with check(true);
create policy push_worker_update on companion_push_private.budget
  for update to companion_push_worker using(true) with check(true);

create policy push_worker_lock_only on companion_push_private.settings
  for update to companion_push_worker using(true) with check(false);
create policy push_worker_lock_only on companion_reminder_private.events
  for update to companion_push_worker using(true) with check(false);
create policy push_worker_lock_only on public.companion_task_reminders
  for update to companion_push_worker using(true) with check(false);
create policy push_worker_lock_only on public.push_tokens
  for update to companion_push_worker using(true) with check(false);
create policy push_worker_lock_only on public.user_onboarding_profiles
  for update to companion_push_worker using(true) with check(false);
-- Existing permissive PUBLIC policies combine with OR. Add restrictive checks.
-- These keep the lock-only rule effective even if request JWT settings change.
create policy push_worker_never_write on companion_push_private.settings as restrictive
  for update to companion_push_worker using(true) with check(false);
create policy push_worker_never_write on companion_reminder_private.events as restrictive
  for update to companion_push_worker using(true) with check(false);
create policy push_worker_never_write on public.companion_task_reminders as restrictive
  for update to companion_push_worker using(true) with check(false);
create policy push_worker_never_write on public.push_tokens as restrictive
  for update to companion_push_worker using(true) with check(false);
create policy push_worker_never_write on public.user_onboarding_profiles as restrictive
  for update to companion_push_worker using(true) with check(false);
commit;
-- No password or LOGIN enablement here. No settings, Cron, or provider change.
