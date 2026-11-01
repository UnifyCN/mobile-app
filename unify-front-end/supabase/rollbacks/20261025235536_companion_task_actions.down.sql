-- Rollback of migrations/20261025235536_companion_task_actions.sql (mobile-app#361).
-- Not a migration: an operator runs it by hand, in one transaction, only after the
-- feature gate is off and action traffic has stopped. Mirrored byte for byte in the
-- web repo. Policy accepted in #360 (DOCS/companion-actions/360-compatibility-decision.md
-- section 6, rollback-reminder policy):
--   * Every pending reminder is stopped first ('schema_rollback', now()). The legacy
--     schema keeps no event history, so re-application cannot tell a task completed and
--     reopened while rolled back from one nobody touched. Re-application restarts no
--     schedule; a new reminder needs a new user-authorized schedule. Reminders already
--     cancelled or sent keep their reason and time. A gate-only disable does not run this.
--   * Soft-removed custom tasks were removed by the user; delete them for real, because
--     the old select policy would show them again.
--   * Rich state (waiting, in progress, steps, plans, reminders, receipts with their
--     inverses, proposals) is archived to companion_rollback_archive before the objects
--     are dropped. No client reads the archive. Re-applying the migration restores it and
--     marks the rows restored. Archive rows hold account data: drop the table by hand
--     once the rollback window (longer than the client retry and Undo windows) is over.
create table if not exists public.companion_rollback_archive (
  id bigint generated always as identity primary key,
  archived_at timestamptz not null default now(),
  source text not null,
  row_data jsonb not null,
  restored_at timestamptz   -- set by the migration when it puts the row back
);
alter table public.companion_rollback_archive add column if not exists restored_at timestamptz;
alter table public.companion_rollback_archive enable row level security;
revoke all on public.companion_rollback_archive from anon, authenticated;

update public.companion_task_reminders
   set status = 'cancelled', cancelled_reason = 'schema_rollback', cancelled_at = now()
 where status = 'pending';

insert into public.companion_rollback_archive (source, row_data)
  select 'user_tasks', to_jsonb(t) from public.user_tasks t
   where progress_state is not null or waiting_reason is not null or revision > 1;
insert into public.companion_rollback_archive (source, row_data)
  select 'custom_checklist_tasks', to_jsonb(t) from public.custom_checklist_tasks t
   where progress_state is not null or waiting_reason is not null or revision > 1 or removed_at is not null;
insert into public.companion_rollback_archive (source, row_data) select 'companion_task_steps', to_jsonb(t) from public.companion_task_steps t;
insert into public.companion_rollback_archive (source, row_data) select 'companion_plans', to_jsonb(t) from public.companion_plans t;
insert into public.companion_rollback_archive (source, row_data) select 'companion_plan_tasks', to_jsonb(t) from public.companion_plan_tasks t;
insert into public.companion_rollback_archive (source, row_data) select 'companion_task_reminders', to_jsonb(t) from public.companion_task_reminders t;
insert into public.companion_rollback_archive (source, row_data) select 'companion_action_receipts', to_jsonb(t) from public.companion_action_receipts t;
insert into public.companion_rollback_archive (source, row_data) select 'companion_proposals', to_jsonb(t) from public.companion_proposals t;

drop trigger companion_user_tasks_before on public.user_tasks;
drop trigger companion_user_tasks_after on public.user_tasks;
drop trigger companion_custom_tasks_before on public.custom_checklist_tasks;
drop trigger companion_custom_tasks_after on public.custom_checklist_tasks;

delete from public.custom_checklist_tasks where removed_at is not null;

drop policy "Users can read own custom checklist tasks" on public.custom_checklist_tasks;
create policy "Users can read own custom checklist tasks" on public.custom_checklist_tasks
  for select using (auth.uid() = user_id);

drop function
  public.companion_read_tasks(uuid), public.companion_action_status(uuid, uuid),
  public.companion_undo_action(uuid, uuid, integer, jsonb, uuid),
  public.companion_apply_actions(uuid, uuid, integer, jsonb, jsonb),
  public.companion_record(uuid, uuid, text, integer, jsonb, jsonb, uuid),
  public.companion_replay(uuid, uuid, text),
  public.companion_reply(public.companion_action_receipts, boolean),
  public.companion_receipt_summary(public.companion_action_receipts),
  public.companion_task_revision(uuid, text),
  public.companion_apply_one(uuid, jsonb), public.companion_task_state(boolean, text),
  public.companion_check_authorization(uuid, jsonb, jsonb),
  public.companion_validate_operations(jsonb), public.companion_set_state_op(text, text, text, bigint),
  public.companion_task_ref_valid(text), public.companion_fail(text, text, jsonb),
  public.companion_op_lock_key(uuid, uuid), public.companion_ops_hash(jsonb), public.companion_nonneg_int(jsonb, integer),
  public.companion_custom_tasks_after(), public.companion_user_tasks_after(),
  public.companion_cancel_reminders(uuid, text, text),
  public.companion_custom_tasks_before(), public.companion_user_tasks_before();

drop table public.companion_plan_tasks, public.companion_plans, public.companion_task_steps,
  public.companion_task_reminders, public.companion_proposals, public.companion_action_receipts,
  public.companion_feature_gate;

alter table public.custom_checklist_tasks
  drop constraint custom_checklist_tasks_waiting_reason_check,
  drop constraint custom_checklist_tasks_progress_state_check,
  drop column removed_at, drop column state_updated_at, drop column revision,
  drop column waiting_reason, drop column progress_state;
alter table public.user_tasks
  drop constraint user_tasks_waiting_reason_check,
  drop constraint user_tasks_progress_state_check,
  drop column state_updated_at, drop column revision, drop column waiting_reason, drop column progress_state;
