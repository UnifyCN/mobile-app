-- Stop the operator route and all dedicated worker sessions before rollback.
-- Apply before older rollbacks. Preserve deliveries, attempts, and tombstones.
begin;
alter role companion_push_worker nologin password null;
drop policy if exists push_worker_select on companion_push_private.settings;
drop policy if exists push_worker_select on companion_push_private.enrollments;
drop policy if exists push_worker_select on companion_push_private.deliveries;
drop policy if exists push_worker_select on companion_push_private.budget;
drop policy if exists push_worker_select on companion_push_private.events;
drop policy if exists push_worker_select on companion_push_private.attempts;
drop policy if exists push_worker_select on companion_reminder_private.events;
drop policy if exists push_worker_select on public.companion_task_reminders;
drop policy if exists push_worker_select on public.push_tokens;
drop policy if exists push_worker_select on public.user_onboarding_profiles;
drop policy if exists push_worker_insert on companion_push_private.deliveries;
drop policy if exists push_worker_insert on companion_push_private.events;
drop policy if exists push_worker_insert on companion_push_private.attempts;
drop policy if exists push_worker_update on companion_push_private.deliveries;
drop policy if exists push_worker_update on companion_push_private.events;
drop policy if exists push_worker_update on companion_push_private.attempts;
drop policy if exists push_worker_update on companion_push_private.enrollments;
drop policy if exists push_worker_update on companion_push_private.budget;
drop policy if exists push_worker_lock_only on companion_push_private.settings;
drop policy if exists push_worker_lock_only on companion_reminder_private.events;
drop policy if exists push_worker_lock_only on public.companion_task_reminders;
drop policy if exists push_worker_lock_only on public.push_tokens;
drop policy if exists push_worker_lock_only on public.user_onboarding_profiles;
drop policy if exists push_worker_never_write on companion_push_private.settings;
drop policy if exists push_worker_never_write on companion_reminder_private.events;
drop policy if exists push_worker_never_write on public.companion_task_reminders;
drop policy if exists push_worker_never_write on public.push_tokens;
drop policy if exists push_worker_never_write on public.user_onboarding_profiles;
revoke all privileges on all tables in schema companion_push_private from companion_push_worker;
revoke all privileges on companion_reminder_private.events, public.companion_task_reminders,
  public.push_tokens, public.user_onboarding_profiles from companion_push_worker;
revoke select(id,user_id,token) on public.push_tokens from companion_push_worker;
revoke select(reminder_id) on companion_push_private.events from companion_push_worker;
revoke select(id,delivery_id,outcome) on companion_push_private.attempts from companion_push_worker;
revoke insert(reminder_id,user_id,task_ref,installation_id,generation,token_id,state) on companion_push_private.deliveries from companion_push_worker;
revoke insert(reminder_id,user_id,reason) on companion_push_private.events from companion_push_worker;
revoke insert(id,delivery_id,number) on companion_push_private.attempts from companion_push_worker;
revoke update(state,attempt_count,ticket,ticket_at,receipt_check_at,next_attempt_at,receipt) on companion_push_private.deliveries from companion_push_worker;
revoke update(reason) on companion_push_private.events from companion_push_worker;
revoke update(outcome,ticket) on companion_push_private.attempts from companion_push_worker;
revoke update(enabled,revision) on companion_push_private.enrollments from companion_push_worker;
revoke update(second_at,minute_at,sends_second,sends_minute,receipts_minute,blocked_until) on companion_push_private.budget from companion_push_worker;
revoke update(singleton) on companion_push_private.settings from companion_push_worker;
revoke update(due_at) on companion_reminder_private.events from companion_push_worker;
revoke update(created_at) on public.companion_task_reminders from companion_push_worker;
revoke update(updated_at) on public.push_tokens,public.user_onboarding_profiles from companion_push_worker;
revoke execute on function companion_push_private.lock_session_authorized(uuid,uuid),
  companion_push_private.session_authorized(uuid,uuid), public.companion_step_parent_lock(uuid,text),
  public.companion_step_parent(uuid,text) from companion_push_worker;
drop function companion_push_private.lock_session_authorized(uuid,uuid);
revoke usage on schema public, companion_push_private, companion_reminder_private from companion_push_worker;
revoke connect on database postgres from companion_push_worker;
-- Restore only the PUBLIC and direct API-role ACL entries changed on apply.
do $$
declare f record; principal text;
begin
  for f in select * from companion_push_private.worker_public_function_grants loop
    if to_regprocedure(f.signature) is null then
      raise exception 'recorded function is missing: %',f.signature;
    end if;
    execute format('grant execute on function %s to public',f.signature);
    foreach principal in array f.added_api_roles loop
      execute format('revoke execute on function %s from %I',f.signature,principal);
    end loop;
  end loop;
end $$;
drop table companion_push_private.worker_public_function_grants;

drop role companion_push_worker;
commit;
