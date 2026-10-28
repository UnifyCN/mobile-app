create or replace function public.companion_receipt_summary(p_receipt public.companion_action_receipts) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'operation_id', p_receipt.operation_id,
    'created_at', p_receipt.created_at,
    'kind', case when p_receipt.undo_of is null then 'change' else 'undo' end,
    'operation_type', coalesce(r->>'type', 'task.set_state'),
    'undo_of', p_receipt.undo_of,
    'task_ref', p_receipt.task_ref,
    'before_state', r->>'before_state',
    'after_state', r->>'state',
    'before_revision', (r->>'before_revision')::bigint,
    'after_revision', (r->>'after_revision')::bigint,
    'undone_by', u.operation_id,
    'current', u.operation_id is null
               and public.companion_task_revision(p_receipt.user_id, p_receipt.task_ref) = (r->>'after_revision')::bigint,
    'undoable', p_receipt.inverse is not null and u.operation_id is null)
    || case when r->>'type' in ('task.create_custom', 'task.remove_created') then
         jsonb_build_object('title', r->>'title')
       when r->>'type' = 'task.edit_details' then
         jsonb_build_object('title', r->>'title', 'changes', r->'changes')
       else '{}'::jsonb end
    -- #365: a state change saved with its waiting reasons names them. A receipt saved
    -- before they were recorded has neither field, not invented ones.
    || case when r ? 'after_waiting_reason' then
         jsonb_build_object('before_waiting_reason', r->'before_waiting_reason',
                            'after_waiting_reason', r->'after_waiting_reason')
       else '{}'::jsonb end
    -- #367: a removal names the task (a custom title; null for a content-backed task) and
    -- what it affected when it was saved: the plans that referred to it, the steps kept as
    -- history and the reminders it stopped. A restore names the task.
    || case when r->>'type' = 'task.remove' then
         jsonb_build_object('title', r->'title', 'plans', r->'plans', 'steps_kept', r->'steps_kept',
                            'reminders_stopped', r->'reminders_stopped')
       when r->>'type' = 'task.restore' then
         jsonb_build_object('title', r->'title', 'plans', r->'plans', 'steps_kept', r->'steps_kept')
       else '{}'::jsonb end
    -- #366: a completion names how many steps were done; a step receipt names its steps
    -- as they were saved and is current while every one of them is unchanged.
    || case when r ? 'steps_total' then
         jsonb_build_object('steps_done', r->'steps_done', 'steps_total', r->'steps_total')
       else '{}'::jsonb end
    || case when r->>'type' like 'step.%' then
         jsonb_build_object('steps', r->'steps',
           'current', u.operation_id is null and public.companion_steps_current(p_receipt.user_id, r->'steps'))
       else '{}'::jsonb end
  from (select p_receipt.outcome->'results'->0 as r) x
  left join public.companion_action_receipts u
    on u.user_id = p_receipt.user_id and u.undo_of = p_receipt.operation_id
$$;
