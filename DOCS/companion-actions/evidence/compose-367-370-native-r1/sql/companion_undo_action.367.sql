create or replace function public.companion_undo_action(
  p_user_id uuid, p_operation_id uuid, p_contract_version integer, p_authorization jsonb, p_receipt_operation_id uuid
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_hash text := public.companion_ops_hash(jsonb_build_object('undo', p_receipt_operation_id));
  v_replay jsonb;
  v_target public.companion_action_receipts%rowtype;
  v_inv jsonb;
  v_ops jsonb := '[]'::jsonb;
  v_current jsonb := '[]'::jsonb;
  v_conflict boolean := false;
  v_rev bigint;
  v_results jsonb := '[]'::jsonb;
  v_prop public.companion_proposals%rowtype;
  v_us public.user_tasks%rowtype;
  v_ct public.custom_checklist_tasks%rowtype;
  v_ref text;
  v_removes boolean;
begin
  v_replay := public.companion_replay(p_user_id, p_operation_id, v_hash);
  if v_replay is not null then return v_replay; end if;
  if jsonb_typeof(p_authorization) is distinct from 'object' or p_authorization->>'kind' is distinct from 'ui_control' then
    perform public.companion_fail('CA403', 'invalid_authorization');
  end if;
  select * into v_target from public.companion_action_receipts
   where user_id = p_user_id and operation_id = p_receipt_operation_id;
  if not found then
    perform public.companion_fail('CA404', 'receipt_not_found');
  end if;
  if v_target.inverse is null then
    perform public.companion_fail('CA422', 'not_undoable');
  end if;
  -- #367: a removal receipt is reversed by the removal domain.
  if v_target.outcome->'results'->0->>'type' = 'task.remove' then
    return public.companion_undo_remove(p_user_id, p_operation_id, v_hash, p_contract_version, v_target);
  end if;
  -- #366: a step receipt is reversed by the step domain.
  if v_target.outcome->'results'->0->>'type' like 'step.%' then
    return public.companion_undo_step(p_user_id, p_operation_id, v_hash, p_contract_version, p_authorization, v_target);
  end if;
  v_removes := exists (select 1 from jsonb_array_elements(v_target.inverse) i where i->>'type' = 'task.remove_created');
  if v_removes and (jsonb_typeof(p_authorization->'removal_confirmed') is distinct from 'boolean'
                    or (p_authorization->>'removal_confirmed')::boolean is not true) then
    perform public.companion_fail('CA403', 'removal_requires_confirmation');
  end if;
  if exists (select 1 from public.companion_action_receipts
              where user_id = p_user_id and undo_of = p_receipt_operation_id) then
    perform public.companion_fail('CA411', 'already_undone', jsonb_build_object('receipt_operation_id', p_receipt_operation_id));
  end if;

  -- Lock every affected task, then compare revisions.
  for v_inv in select * from jsonb_array_elements(v_target.inverse) loop
    v_ref := v_inv->>'task_ref';
    if split_part(v_ref, ':', 1) = 'sanity' then
      select * into v_us from public.user_tasks
       where user_id = p_user_id and sanity_checklist_id = substr(v_ref, 8) for update;
      v_rev := case when found then v_us.revision else 0 end;
      v_current := v_current || jsonb_build_array(jsonb_build_object('task_ref', v_ref, 'revision', v_rev,
        'state', case when found then public.companion_task_state(v_us.completed, v_us.progress_state) else 'not_started' end,
        'waiting_reason', case when found then v_us.waiting_reason end,
        'removed', found and v_us.dismissed_at is not null));
    else
      select * into v_ct from public.custom_checklist_tasks
       where user_id = p_user_id and id = substr(v_ref, 8)::bigint for update;
      if not found then
        perform public.companion_fail('CA404', 'task_not_found', jsonb_build_object('task_ref', v_ref));
      end if;
      if v_inv->>'type' in ('task.remove_created', 'task.edit_details') and v_ct.removed_at is not null then
        perform public.companion_fail('CA422', 'task_removed', jsonb_build_object('task_ref', v_ref));
      end if;
      v_rev := v_ct.revision;
      v_current := v_current || jsonb_build_array(jsonb_build_object('task_ref', v_ref, 'revision', v_rev,
        'state', public.companion_task_state(v_ct.completed, v_ct.progress_state),
        'waiting_reason', v_ct.waiting_reason, 'removed', v_ct.removed_at is not null,
        'title', v_ct.title, 'description', v_ct.description, 'priority', v_ct.priority));
    end if;
    if v_rev <> (v_inv->>'expected_revision')::bigint then
      v_conflict := true;
    end if;
    if v_inv->>'type' = 'task.remove_created' then
      v_ops := v_ops || jsonb_build_array(jsonb_build_object(
        'type', 'task.remove_created', 'task_ref', v_ref, 'expected_revision', v_rev));
    elsif v_inv->>'type' = 'task.edit_details' then
      v_ops := v_ops || jsonb_build_array(v_inv || jsonb_build_object('expected_revision', v_rev));
    else
      v_ops := v_ops || jsonb_build_array(public.companion_set_state_op(
        v_ref, v_inv->>'state', v_inv->>'waiting_reason', v_rev));
    end if;
  end loop;

  -- A concurrent Undo of the same receipt may have committed while this one waited for the
  -- row locks. Re-check under the locks so it reads as already undone, not as a conflict.
  if exists (select 1 from public.companion_action_receipts
              where user_id = p_user_id and undo_of = p_receipt_operation_id) then
    perform public.companion_fail('CA411', 'already_undone', jsonb_build_object('receipt_operation_id', p_receipt_operation_id));
  end if;

  if v_conflict then
    -- Reuse an unconsumed compensating draft for the same operations, else create one.
    select * into v_prop from public.companion_proposals
     where user_id = p_user_id and undo_of = p_receipt_operation_id and status = 'draft'
       and operations_hash = public.companion_ops_hash(v_ops)
     order by created_at desc limit 1;
    if not found then
      insert into public.companion_proposals (user_id, operations, operations_hash, undo_of, kind, updated_at)
      values (p_user_id, v_ops, public.companion_ops_hash(v_ops), p_receipt_operation_id, 'compensation', now())
      returning * into v_prop;
    end if;
    return jsonb_build_object('conflict', true, 'receipt_operation_id', p_receipt_operation_id,
      'current', v_current,
      'proposal', jsonb_build_object('proposal_id', v_prop.id, 'proposal_revision', v_prop.revision,
                                     'operations', v_prop.operations));
  end if;

  for v_inv in select * from jsonb_array_elements(v_ops) loop
    v_results := v_results || jsonb_build_array(public.companion_apply_one(p_user_id, v_inv));
  end loop;
  return public.companion_record(p_user_id, p_operation_id, v_hash, p_contract_version,
    jsonb_build_object('kind', 'ui_control', 'undo_of', p_receipt_operation_id)
      || case when v_removes then jsonb_build_object('removal_confirmed', true) else '{}'::jsonb end,
    v_results, p_receipt_operation_id);
end $$;
