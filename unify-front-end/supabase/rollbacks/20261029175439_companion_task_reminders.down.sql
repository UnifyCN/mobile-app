-- #368 rollback. Stop execution first. Preserve history and immutable receipts.
select cron.unschedule(jobid) from cron.job where jobname='companion-reminder-due';
update public.companion_task_reminders set status='cancelled',cancelled_reason='schema_rollback',cancelled_at=clock_timestamp() where status='pending';
insert into companion_reminder_private.archive select 'reminder',id::text,to_jsonb(r),r.user_id from public.companion_task_reminders r on conflict(source,identity) do update set row_data=excluded.row_data;
insert into companion_reminder_private.archive select 'receipt',r.user_id::text||':'||operation_id::text,to_jsonb(r),r.user_id from public.companion_action_receipts r where outcome->'results'->0->>'type' in ('reminder.schedule','reminder.cancel') on conflict(source,identity) do update set row_data=excluded.row_data;
insert into companion_reminder_private.archive select 'proposal',id::text,to_jsonb(p),p.user_id from public.companion_proposals p where kind='reminder' on conflict(source,identity) do update set row_data=excluded.row_data;
delete from public.companion_action_receipts where outcome->'results'->0->>'type' in ('reminder.schedule','reminder.cancel');
delete from public.companion_proposals where kind='reminder';
drop function public.companion_conversation_actions(uuid,uuid);
alter function public.companion_before368_conversation(uuid,uuid) rename to companion_conversation_actions;
drop function public.companion_read_reminders(uuid);
drop function companion_reminder_private.tick();
drop trigger companion_reminder_audit on public.companion_task_reminders;
drop function companion_reminder_private.audit();
drop function public.companion_validate_operations(jsonb);
alter function public.companion_before368_validate(jsonb) rename to companion_validate_operations;
drop function public.companion_prepare_proposal(uuid,jsonb,jsonb);
alter function public.companion_before368_prepare(uuid,jsonb,jsonb) rename to companion_prepare_proposal;
drop function public.companion_recheck_proposal(uuid,jsonb,jsonb);
alter function public.companion_before368_recheck(uuid,jsonb,jsonb) rename to companion_recheck_proposal;
drop function public.companion_check_authorization(uuid,jsonb,jsonb);
alter function public.companion_before368_authorization(uuid,jsonb,jsonb) rename to companion_check_authorization;
drop function public.companion_apply_one(uuid,jsonb);
alter function public.companion_before368_apply(uuid,jsonb) rename to companion_apply_one;
drop function public.companion_receipt_summary(public.companion_action_receipts);
alter function public.companion_before368_summary(public.companion_action_receipts) rename to companion_receipt_summary;
drop function public.companion_undo_action(uuid,uuid,integer,jsonb,uuid);
alter function public.companion_before368_undo(uuid,uuid,integer,jsonb,uuid) rename to companion_undo_action;
drop function public.companion_reminder_context(uuid,jsonb);
drop index public.companion_reminders_one_pending;
drop index public.companion_reminders_due;
alter table public.companion_task_reminders drop column revision,drop column wall_time,drop column replaces_id,drop column next_attempt_at,drop column attempt_count,drop column last_error;
alter table public.companion_proposals drop constraint companion_proposals_kind_check;
alter table public.companion_proposals add constraint companion_proposals_kind_check check(kind is null or kind in ('compensation','task_create','step_create','task_edit','detail_create','task_remove'));
-- Private history/events/archive remain, with no job or worker. No schema reapply
-- can make their cancelled schedules pending. A new explicit schedule is required.
notify pgrst,'reload schema';
