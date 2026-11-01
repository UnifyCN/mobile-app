create or replace function public.companion_apply_one(p_user uuid, p_op jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ref text := p_op->>'task_ref';
  v_source text := split_part(coalesce(v_ref, ''), ':', 1);
  v_key text := substr(coalesce(v_ref, ''), position(':' in coalesce(v_ref, '')) + 1);
  v_expected bigint := (p_op->>'expected_revision')::bigint;
  v_state text := p_op->>'state';
  v_completed boolean := (v_state = 'completed');
  v_progress text := case when v_state in ('in_progress', 'waiting') then v_state end;
  v_reason text := case when v_state = 'waiting' then nullif(btrim(coalesce(p_op->>'waiting_reason', '')), '') end;
  v_us public.user_tasks%rowtype;
  v_ct public.custom_checklist_tasks%rowtype;
  v_before bigint;
  v_after bigint;
  v_before_state text;
  v_before_reason text;
  v_id bigint;
  v_old jsonb;
  v_changes jsonb := '[]'::jsonb;
  v_inverse jsonb;
  v_field text;
begin
  -- #366: a step operation is executed by the step domain.
  if p_op->>'type' like 'step.%' then
    return public.companion_apply_step(p_user, p_op);
  end if;
  if p_op->>'type' = 'task.edit_details' then
    -- Title, description and priority of one custom task, at the revision the caller saw.
    -- Only changed fields are written; history keeps what each was before.
    select * into v_ct from public.custom_checklist_tasks where id = v_key::bigint and user_id = p_user for update;
    if not found then
      perform public.companion_fail('CA404', 'task_not_found', jsonb_build_object('task_ref', v_ref));
    end if;
    if v_ct.removed_at is not null then
      perform public.companion_fail('CA422', 'task_removed', jsonb_build_object('task_ref', v_ref));
    end if;
    if v_ct.revision <> v_expected then
      perform public.companion_fail('CA409', 'revision_conflict',
        jsonb_build_object('task_ref', v_ref, 'expected', v_expected, 'actual', v_ct.revision));
    end if;
    v_old := jsonb_build_object('title', v_ct.title, 'description', v_ct.description, 'priority', v_ct.priority);
    v_inverse := jsonb_build_object('type', 'task.edit_details', 'task_ref', v_ref);
    foreach v_field in array array['title', 'description', 'priority'] loop
      if p_op ? v_field and p_op->>v_field is distinct from v_old->>v_field then
        v_changes := v_changes || jsonb_build_array(jsonb_build_object(
          'field', v_field, 'before', v_old->v_field, 'after', p_op->v_field));
        v_inverse := v_inverse || jsonb_build_object(v_field, v_old->v_field);
      end if;
    end loop;
    if jsonb_array_length(v_changes) = 0 then
      perform public.companion_fail('CA422', 'no_change', jsonb_build_object('task_ref', v_ref));
    end if;
    update public.custom_checklist_tasks
       set title = coalesce(p_op->>'title', title),
           description = coalesce(p_op->>'description', description),
           priority = coalesce(p_op->>'priority', priority)
     where id = v_ct.id returning * into v_ct;
    v_before_state := public.companion_task_state(v_ct.completed, v_ct.progress_state);
    -- The title the task has after this change: the receipt keeps naming it (history).
    return jsonb_build_object(
      'type', 'task.edit_details', 'task_ref', v_ref, 'title', v_ct.title, 'changes', v_changes,
      'before_state', v_before_state, 'state', v_before_state,
      'before_revision', v_expected, 'after_revision', v_ct.revision,
      'inverse', v_inverse || jsonb_build_object('expected_revision', v_ct.revision));
  end if;

  if p_op->>'type' = 'task.remove_created' then
    -- Soft removal (removed_at): hidden from every Checklist read, pending reminders
    -- stopped by the trigger in the same transaction, history kept.
    select * into v_ct from public.custom_checklist_tasks where id = v_key::bigint and user_id = p_user for update;
    if not found then
      perform public.companion_fail('CA404', 'task_not_found', jsonb_build_object('task_ref', v_ref));
    end if;
    if v_ct.removed_at is not null then
      perform public.companion_fail('CA422', 'task_removed', jsonb_build_object('task_ref', v_ref));
    end if;
    if v_ct.revision <> v_expected then
      perform public.companion_fail('CA409', 'revision_conflict',
        jsonb_build_object('task_ref', v_ref, 'expected', v_expected, 'actual', v_ct.revision));
    end if;
    update public.custom_checklist_tasks set removed_at = now() where id = v_ct.id returning revision into v_after;
    v_before_state := public.companion_task_state(v_ct.completed, v_ct.progress_state);
    -- The title the task had when it was removed: the receipt keeps it (history).
    return jsonb_build_object(
      'type', 'task.remove_created', 'task_ref', v_ref, 'title', v_ct.title,
      'before_state', v_before_state, 'state', v_before_state,
      'before_revision', v_ct.revision, 'after_revision', v_after);
  end if;

  if p_op->>'type' = 'task.create_custom' then
    insert into public.custom_checklist_tasks (user_id, priority, title, description)
    values (p_user, p_op->>'priority', p_op->>'title', '')
    returning id, revision into v_id, v_after;
    -- The authorized title is recorded with the result, so the receipt keeps naming the
    -- change it saved after the task is renamed (history, not the current task).
    return jsonb_build_object(
      'type', 'task.create_custom', 'task_ref', 'custom:' || v_id, 'title', p_op->>'title',
      'before_state', 'not_started', 'state', 'not_started',
      'before_revision', 0, 'after_revision', v_after,
      'inverse', jsonb_build_object('type', 'task.remove_created', 'task_ref', 'custom:' || v_id,
                                    'expected_revision', v_after));
  end if;

  if v_source = 'sanity' then
    select * into v_us from public.user_tasks where user_id = p_user and sanity_checklist_id = v_key for update;
    if not found then
      v_before := 0; v_before_state := 'not_started'; v_before_reason := null;
    else
      v_before := v_us.revision;
      v_before_state := public.companion_task_state(v_us.completed, v_us.progress_state);
      v_before_reason := v_us.waiting_reason;
      if v_us.dismissed_at is not null then
        perform public.companion_fail('CA422', 'task_removed', jsonb_build_object('task_ref', v_ref));
      end if;
    end if;
    if v_before <> v_expected then
      perform public.companion_fail('CA409', 'revision_conflict',
        jsonb_build_object('task_ref', v_ref, 'expected', v_expected, 'actual', v_before));
    end if;
    begin
      if v_before = 0 then
        insert into public.user_tasks (user_id, sanity_checklist_id, completed, completed_at, progress_state, waiting_reason)
        values (p_user, v_key, v_completed, case when v_completed then now() end, v_progress, v_reason)
        returning revision into v_after;
      else
        update public.user_tasks
           set completed = v_completed,
               completed_at = case when v_completed then coalesce(case when v_us.completed then v_us.completed_at end, now()) end,
               progress_state = v_progress, waiting_reason = v_reason
         where user_task_id = v_us.user_task_id returning revision into v_after;
      end if;
    exception when unique_violation then
      -- A legacy client inserted the row after our read: the caller's revision is stale.
      perform public.companion_fail('CA409', 'revision_conflict',
        jsonb_build_object('task_ref', v_ref, 'expected', v_expected, 'actual', null));
    end;
  elsif v_source = 'custom' then
    select * into v_ct from public.custom_checklist_tasks where id = v_key::bigint and user_id = p_user for update;
    if not found then
      perform public.companion_fail('CA404', 'task_not_found', jsonb_build_object('task_ref', v_ref));
    end if;
    v_before := v_ct.revision;
    v_before_state := public.companion_task_state(v_ct.completed, v_ct.progress_state);
    v_before_reason := v_ct.waiting_reason;
    if v_ct.removed_at is not null then
      perform public.companion_fail('CA422', 'task_removed', jsonb_build_object('task_ref', v_ref));
    end if;
    if v_before <> v_expected then
      perform public.companion_fail('CA409', 'revision_conflict',
        jsonb_build_object('task_ref', v_ref, 'expected', v_expected, 'actual', v_before));
    end if;
    update public.custom_checklist_tasks
       set completed = v_completed,
           completed_at = case when v_completed then coalesce(case when v_ct.completed then v_ct.completed_at end, now()) end,
           progress_state = v_progress, waiting_reason = v_reason
     where id = v_ct.id returning revision into v_after;
  else
    perform public.companion_fail('CA422', 'invalid_task_ref');
  end if;

  -- #365: the waiting reason before and after is part of what a state change saved, so its
  -- receipt names it (a reason-only change would otherwise read Waiting to Waiting).
  return jsonb_build_object(
    'type', 'task.set_state', 'task_ref', v_ref,
    'before_state', v_before_state, 'state', v_state,
    'before_waiting_reason', v_before_reason, 'after_waiting_reason', v_reason,
    'before_revision', v_before, 'after_revision', v_after,
    'inverse', public.companion_set_state_op(v_ref, v_before_state, v_before_reason, v_after))
    -- #366: a completion records the steps as they were: how many were done of how many.
    || case when v_state = 'completed' then (
         select jsonb_build_object('steps_done', count(*) filter (where s.completed), 'steps_total', count(*))
           from public.companion_task_steps s
          where s.user_id = p_user and s.task_ref = v_ref and s.removed_at is null)
       else '{}'::jsonb end;
end $$;
