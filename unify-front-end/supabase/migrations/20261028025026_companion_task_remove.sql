-- Companion task removal: every removal of a Checklist task is a reviewed draft that names
-- the task and its effects on shared plans, steps and reminders, and only the approval of
-- that exact revision with the user's confirmation removes it; Undo names the removal
-- receipt and checks current revisions (mobile-app#367). Builds on #361 (task columns,
-- triggers, receipts), #363 (proposals), #364 (plans), #366 (steps) and #365 (edits).
--
-- Authority: this repo owns the migration. The web repo mirrors this file byte for byte
-- with the same timestamp. Rollback script (mirrored too):
-- supabase/rollbacks/20261028025026_companion_task_remove.down.sql. Apply order is by
-- timestamp: #361, #363, #364, #366, #365 (20261028001530), #370 (20261028004902), then this one; roll back in
-- reverse, so run it before the #370 rollback. Apply through the normal release path
-- with the gate off.
--
-- Mapping (decided in #360, unchanged): a content-backed task is removed by the legacy
-- dismissal (user_tasks.dismissed_at); a custom task by reversible soft removal
-- (custom_checklist_tasks.removed_at), which the #361 policy hides from older clients. No
-- row is deleted and no delete trigger is added (the rejected #360 design broke account
-- deletion). Steps, plan references, receipts and reminder history stay, so Undo can
-- restore the task. Plans read their references through the task rows: a removed task
-- shows as removed in every plan, and comes back when restored, except in a plan that
-- was removed separately.
--
-- Lifecycle: removal sets the legacy removal column, so the #361 triggers stop pending
-- reminders in the same transaction (reason task_removed). That trigger is the single
-- task-lifecycle hook a later reminder schedule (#368) joins; restore, reopen and Undo
-- never restart a stopped reminder. Nothing here schedules a reminder.
--
-- Composition: #367 retains the preceding #370 saved-detail dispatch, receipts,
-- proposal context and authorization. The down script restores those #370 bodies.
-- Additive: no column changes. A widened proposal kind, new removal functions, and
-- eight shared #370 definitions with the reviewed #367 removal branches. The plan
-- writer retains #364 plus the #367 reference lock. All other #370 functions remain
-- installed. The down script restores the eight #370 bodies and their existing ACLs.

alter table public.companion_proposals drop constraint companion_proposals_kind_check;
alter table public.companion_proposals add constraint companion_proposals_kind_check
  check (kind is null or kind in ('compensation', 'task_create', 'step_create', 'task_edit', 'detail_create', 'task_remove'));

-- ------------------------------------------ recovery after a rollback (down script)
-- The rollback script archives removal receipts and removal drafts to
-- companion_rollback_archive_367. Re-applying puts them back, so a removal committed
-- before the rollback can still be undone (revision-checked) and a retry replays it. A
-- restored open removal review moves to a new revision that needs review. Rows of
-- deleted accounts are not restored.
do $recover367$
begin
  if to_regclass('public.companion_rollback_archive_367') is null then
    return;
  end if;
  insert into public.companion_action_receipts
    select (jsonb_populate_record(null::public.companion_action_receipts, a.row_data)).*
      from public.companion_rollback_archive_367 a
     where a.source = 'companion_action_receipts' and a.restored_at is null
       and exists (select 1 from auth.users u where u.id = (a.row_data->>'user_id')::uuid)
     order by a.id
    on conflict do nothing;
  insert into public.companion_proposals
    select (jsonb_populate_record(null::public.companion_proposals,
              case when a.row_data->>'status' = 'draft' and a.row_data->>'kind' = 'task_remove'
                   then a.row_data || jsonb_build_object('revision', (a.row_data->>'revision')::int + 1,
                                                         'review_reason', 'restored', 'previous_context', null)
                   else a.row_data end)).*
      from public.companion_rollback_archive_367 a
     where a.source = 'companion_proposals' and a.restored_at is null
       and exists (select 1 from auth.users u where u.id = (a.row_data->>'user_id')::uuid)
     order by a.id
    on conflict do nothing;
  update public.companion_rollback_archive_367 set restored_at = now() where restored_at is null;
end $recover367$;

-- ------------------------------------------------------------------ removal domain
-- What removing a task affects, read now: the task (a custom title; null for a
-- content-backed task, whose title is published content), its state and revision, the
-- saved plans that refer to it, its live steps and its pending reminders. A removal
-- review shows exactly this; its approval is refused when any of it changed.
create function public.companion_remove_effects(p_user uuid, p_ref text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'task_ref', p_ref, 'title', t->'title', 'state', t->'state', 'revision', t->'revision',
    'removed', t->'removed',
    'plans', coalesce((select jsonb_agg(jsonb_build_object('plan_id', p.id, 'goal', p.goal) order by p.created_at, p.id)
                         from public.companion_plans p
                        where p.user_id = p_user and p.removed_at is null
                          and exists (select 1 from public.companion_plan_tasks pt
                                       where pt.plan_id = p.id and pt.task_ref = p_ref)), '[]'::jsonb),
    'steps_total', (select count(*) from public.companion_task_steps s
                     where s.user_id = p_user and s.task_ref = p_ref and s.removed_at is null),
    'reminders_pending', (select count(*) from public.companion_task_reminders r
                           where r.user_id = p_user and r.task_ref = p_ref and r.status = 'pending'))
  from (select public.companion_plan_task_now(p_user, p_ref) as t) x
$$;

-- The plan-reference lock of one task. A removal names the saved plans that refer to the
-- task, and a plan approval checks that each existing task it refers to is still there:
-- without an order, each could read before the other writes (a plan saved with a removed
-- task, or a removal receipt without the plan). A plan write that adds references to
-- existing tasks holds this lock shared for each of them (companion_plan_items_lock); a
-- removal, a restore and an Undo of a removal hold it exclusively (companion_remove_lock).
-- Both read after it. Plan writes of the same task do not wait for each other, and nothing
-- waits for a plan or removal of another task.
create function public.companion_plan_ref_key(p_user uuid, p_ref text) returns bigint
language sql immutable as $$
  select hashtextextended(p_user::text || ':' || p_ref, 367)
$$;

-- Takes the shared plan-reference lock of each existing task the plan items refer to, in
-- one order. Items of other kinds (new tasks, an Undo's removals) take nothing.
create function public.companion_plan_items_lock(p_user uuid, p_items jsonb) returns void
language plpgsql set search_path = public, pg_temp as $$
declare
  v_ref text;
begin
  for v_ref in select distinct i->>'task_ref' from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
                where i->>'kind' = 'existing' and jsonb_typeof(i->'task_ref') = 'string'
                order by 1 loop
    perform pg_advisory_xact_lock_shared(public.companion_plan_ref_key(p_user, v_ref));
  end loop;
end $$;

-- Orders a removal or restore of one task with every other write of it: the #366 parent
-- lock (step writes, legacy completing/removing inserts), then the plan-reference lock
-- (plan writes that add a reference to it), then the task row (state changes, legacy
-- updates). Lock order: proposal row, parent lock, plan-reference lock, task row.
-- Raises task_not_found for a custom task this account does not own.
create function public.companion_remove_lock(p_user uuid, p_ref text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if p_ref is null or not public.companion_task_ref_valid(p_ref) then
    perform public.companion_fail('CA422', 'invalid_task_ref');
  end if;
  perform public.companion_step_parent_lock(p_user, p_ref);
  perform pg_advisory_xact_lock(public.companion_plan_ref_key(p_user, p_ref));
  if split_part(p_ref, ':', 1) = 'sanity' then
    perform 1 from public.user_tasks where user_id = p_user and sanity_checklist_id = substr(p_ref, 8) for update;
  else
    perform 1 from public.custom_checklist_tasks where user_id = p_user and id = substr(p_ref, 8)::bigint for update;
    if not found then
      perform public.companion_fail('CA404', 'task_not_found', jsonb_build_object('task_ref', p_ref));
    end if;
  end if;
end $$;

-- A removal review: one open draft per task and source (a panel, or one command message),
-- prepared at the task's current revision with its current effects. Asking again returns
-- the same draft, refreshed to a new revision when the effects changed. Writes only the
-- draft, never the task.
create function public.companion_remove_prepare(p_user uuid, p_ref text, p_source jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_now jsonb;
  v_ops jsonb;
  v_source jsonb := public.companion_check_source(p_user, p_source);
  v_prop public.companion_proposals%rowtype;
begin
  if split_part(p_ref, ':', 1) = 'custom' and not exists (
       select 1 from public.custom_checklist_tasks c where c.user_id = p_user and c.id = substr(p_ref, 8)::bigint) then
    perform public.companion_fail('CA404', 'task_not_found', jsonb_build_object('task_ref', p_ref));
  end if;
  v_now := public.companion_remove_effects(p_user, p_ref);
  if (v_now->>'removed')::boolean then
    perform public.companion_fail('CA422', 'task_removed', jsonb_build_object('task_ref', p_ref));
  end if;
  v_ops := jsonb_build_array(jsonb_build_object('type', 'task.remove', 'task_ref', p_ref,
                                                'expected_revision', (v_now->>'revision')::bigint));
  select * into v_prop from public.companion_proposals
   where user_id = p_user and kind = 'task_remove' and status = 'draft'
     and operations->0->>'task_ref' = p_ref and source is not distinct from v_source
   order by created_at desc limit 1 for update;
  if not found then
    insert into public.companion_proposals (user_id, operations, operations_hash, kind, context, source, updated_at)
    values (p_user, v_ops, public.companion_ops_hash(v_ops), 'task_remove', v_now, v_source, now())
    returning * into v_prop;
  elsif v_prop.context is distinct from v_now then
    update public.companion_proposals
       set operations = v_ops, operations_hash = public.companion_ops_hash(v_ops), revision = revision + 1,
           previous_context = context, context = v_now, review_reason = 'context_changed', updated_at = now()
     where id = v_prop.id
    returning * into v_prop;
  end if;
  return public.companion_proposal_view(v_prop);
end $$;

-- Approval recheck of a removal review, under the parent lock and the task row lock (held
-- until the removal commits). A task removed meanwhile is refused; any change of what the
-- review named (state, revision, title, plans, steps, pending reminders) moves the draft to a
-- new revision bound to the current values, writes nothing, and needs a new approval.
-- Unchanged: null, and the approval goes on under the same locks.
create function public.companion_remove_recheck(p_user uuid, p_prop public.companion_proposals) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ref text := p_prop.operations->0->>'task_ref';
  v_now jsonb;
  v_ops jsonb;
  v_prop public.companion_proposals%rowtype;
begin
  perform public.companion_remove_lock(p_user, v_ref);
  v_now := public.companion_remove_effects(p_user, v_ref);
  if (v_now->>'removed')::boolean then
    perform public.companion_fail('CA422', 'task_removed', jsonb_build_object('task_ref', v_ref));
  end if;
  if v_now = p_prop.context then
    return null;
  end if;
  v_ops := jsonb_build_array(jsonb_build_object('type', 'task.remove', 'task_ref', v_ref,
                                                'expected_revision', (v_now->>'revision')::bigint));
  update public.companion_proposals
     set operations = v_ops, operations_hash = public.companion_ops_hash(v_ops), revision = revision + 1,
         previous_context = context, context = v_now, review_reason = 'context_changed', updated_at = now()
   where id = p_prop.id
  returning * into v_prop;
  return public.companion_proposal_view(v_prop);
end $$;

-- Removes one task at the revision the user reviewed. Custom: soft removal (removed_at),
-- hidden from every Checklist read and from older clients. Content-backed: the legacy
-- dismissal (dismissed_at), inserting the progress row when there is none. Steps, plan
-- references, receipts and reminder history stay; pending reminders stop in this same
-- transaction through the #361 task triggers (reason task_removed). The result records
-- the removal time (Undo restores only this removal) and the effects at that moment.
create function public.companion_remove_task(p_user uuid, p_op jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ref text := p_op->>'task_ref';
  v_key text := substr(p_op->>'task_ref', 8);
  v_expected bigint := (p_op->>'expected_revision')::bigint;
  v_us public.user_tasks%rowtype;
  v_ct public.custom_checklist_tasks%rowtype;
  v_effects jsonb;
  v_after bigint;
  v_at timestamptz;
begin
  perform public.companion_remove_lock(p_user, v_ref);
  v_effects := public.companion_remove_effects(p_user, v_ref);
  if (v_effects->>'removed')::boolean then
    perform public.companion_fail('CA422', 'task_removed', jsonb_build_object('task_ref', v_ref));
  end if;
  if (v_effects->>'revision')::bigint <> v_expected then
    perform public.companion_fail('CA409', 'revision_conflict',
      jsonb_build_object('task_ref', v_ref, 'expected', v_expected, 'actual', (v_effects->>'revision')::bigint));
  end if;
  if split_part(v_ref, ':', 1) = 'sanity' then
    select * into v_us from public.user_tasks where user_id = p_user and sanity_checklist_id = v_key;
    begin
      if not found then
        insert into public.user_tasks (user_id, sanity_checklist_id, dismissed_at)
        values (p_user, v_key, now()) returning revision, dismissed_at into v_after, v_at;
      else
        update public.user_tasks set dismissed_at = now()
         where user_task_id = v_us.user_task_id returning revision, dismissed_at into v_after, v_at;
      end if;
    exception when unique_violation then
      perform public.companion_fail('CA409', 'revision_conflict',
        jsonb_build_object('task_ref', v_ref, 'expected', v_expected, 'actual', null));
    end;
  else
    update public.custom_checklist_tasks set removed_at = now()
     where user_id = p_user and id = v_key::bigint returning revision, removed_at into v_after, v_at;
  end if;
  return jsonb_build_object(
    'type', 'task.remove', 'task_ref', v_ref, 'title', v_effects->'title',
    'before_state', v_effects->'state', 'state', v_effects->'state',
    'before_revision', v_expected, 'after_revision', v_after, 'removed_at', v_at,
    'plans', v_effects->'plans', 'steps_kept', v_effects->'steps_total',
    'reminders_stopped', v_effects->'reminders_pending',
    'inverse', jsonb_build_object('type', 'task.restore', 'task_ref', v_ref, 'expected_revision', v_after));
end $$;

-- Restores a removed task at the revision named (Undo of its removal, or the approved
-- reviewed restore of a conflicting Undo). Clears only the removal: state, waiting reason,
-- steps and any newer edit stay. Plan references come back in every plan that still
-- exists; a plan removed separately stays removed. No reminder is restarted.
create function public.companion_restore_task(p_user uuid, p_op jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ref text := p_op->>'task_ref';
  v_key text := substr(p_op->>'task_ref', 8);
  v_expected bigint := (p_op->>'expected_revision')::bigint;
  v_before jsonb;
  v_after bigint;
  v_effects jsonb;
begin
  perform public.companion_remove_lock(p_user, v_ref);
  v_before := public.companion_remove_effects(p_user, v_ref);
  if not (v_before->>'removed')::boolean then
    perform public.companion_fail('CA422', 'task_not_removed', jsonb_build_object('task_ref', v_ref));
  end if;
  if (v_before->>'revision')::bigint <> v_expected then
    perform public.companion_fail('CA409', 'revision_conflict',
      jsonb_build_object('task_ref', v_ref, 'expected', v_expected, 'actual', (v_before->>'revision')::bigint));
  end if;
  if split_part(v_ref, ':', 1) = 'sanity' then
    update public.user_tasks set dismissed_at = null
     where user_id = p_user and sanity_checklist_id = v_key returning revision into v_after;
  else
    update public.custom_checklist_tasks set removed_at = null
     where user_id = p_user and id = v_key::bigint returning revision into v_after;
  end if;
  v_effects := public.companion_remove_effects(p_user, v_ref);
  return jsonb_build_object(
    'type', 'task.restore', 'task_ref', v_ref, 'title', v_effects->'title',
    'before_state', v_effects->'state', 'state', v_effects->'state',
    'before_revision', v_expected, 'after_revision', v_after,
    'plans', v_effects->'plans', 'steps_kept', v_effects->'steps_total');
end $$;

-- Undo of one removal receipt. Restores the task when it is still at the revision the
-- removal produced. Otherwise nothing changes ({ conflict: true, reason }):
--   not_removed   the task is back already (restored elsewhere, e.g. by an older app);
--   removed_again it was restored and removed again later: that newer removal has its
--                 own receipt, and this one never recreates it;
--   changed       the same removal, but the task changed since (a newer edit): a reviewed
--                 restore at the current revision is offered; it keeps the newer edit.
create function public.companion_undo_remove(
  p_user uuid, p_op uuid, p_hash text, p_version integer, p_target public.companion_action_receipts
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_inv jsonb := p_target.inverse->0;
  v_ref text := p_target.inverse->0->>'task_ref';
  v_now jsonb;
  v_current jsonb;
  v_at timestamptz;
  v_ops jsonb;
  v_prop public.companion_proposals%rowtype;
begin
  if exists (select 1 from public.companion_action_receipts where user_id = p_user and undo_of = p_target.operation_id) then
    perform public.companion_fail('CA411', 'already_undone', jsonb_build_object('receipt_operation_id', p_target.operation_id));
  end if;
  perform public.companion_remove_lock(p_user, v_ref);
  -- A concurrent Undo may have committed while this one waited for the locks.
  if exists (select 1 from public.companion_action_receipts where user_id = p_user and undo_of = p_target.operation_id) then
    perform public.companion_fail('CA411', 'already_undone', jsonb_build_object('receipt_operation_id', p_target.operation_id));
  end if;
  v_now := public.companion_remove_effects(p_user, v_ref);
  v_current := jsonb_build_array(jsonb_build_object('task_ref', v_ref, 'revision', v_now->'revision',
    'state', v_now->'state', 'removed', v_now->'removed',
    'waiting_reason', public.companion_plan_task_now(p_user, v_ref)->'waiting_reason'));
  if (v_now->>'revision')::bigint = (v_inv->>'expected_revision')::bigint then
    return public.companion_record(p_user, p_op, p_hash, p_version,
      jsonb_build_object('kind', 'ui_control', 'undo_of', p_target.operation_id),
      jsonb_build_array(public.companion_restore_task(p_user, v_inv)), p_target.operation_id);
  end if;
  if not (v_now->>'removed')::boolean then
    return jsonb_build_object('conflict', true, 'reason', 'not_removed', 'receipt_operation_id', p_target.operation_id,
      'current', v_current, 'proposal', null);
  end if;
  v_at := case split_part(v_ref, ':', 1)
            when 'sanity' then (select dismissed_at from public.user_tasks
                                 where user_id = p_user and sanity_checklist_id = substr(v_ref, 8))
            else (select removed_at from public.custom_checklist_tasks
                   where user_id = p_user and id = substr(v_ref, 8)::bigint) end;
  if v_at is distinct from (p_target.outcome->'results'->0->>'removed_at')::timestamptz then
    return jsonb_build_object('conflict', true, 'reason', 'removed_again', 'receipt_operation_id', p_target.operation_id,
      'current', v_current, 'proposal', null);
  end if;
  v_ops := jsonb_build_array(jsonb_build_object('type', 'task.restore', 'task_ref', v_ref,
                                                'expected_revision', (v_now->>'revision')::bigint));
  select * into v_prop from public.companion_proposals
   where user_id = p_user and undo_of = p_target.operation_id and status = 'draft'
     and operations_hash = public.companion_ops_hash(v_ops)
   order by created_at desc limit 1;
  if not found then
    insert into public.companion_proposals (user_id, operations, operations_hash, undo_of, kind, updated_at)
    values (p_user, v_ops, public.companion_ops_hash(v_ops), p_target.operation_id, 'compensation', now())
    returning * into v_prop;
  end if;
  return jsonb_build_object('conflict', true, 'reason', 'changed', 'receipt_operation_id', p_target.operation_id,
    'current', v_current,
    'proposal', jsonb_build_object('proposal_id', v_prop.id, 'proposal_revision', v_prop.revision,
                                   'operations', v_prop.operations));
end $$;

-- ------------------------------------------------ shared action functions (#361-#366)
-- Each keeps the body current before this migration (#365, else #366) verbatim and adds
-- only the marked #367 lines.

create or replace function public.companion_validate_operations(p_ops jsonb) returns void
language plpgsql as $$
declare
  v_op jsonb; v_type text; v_ref text; v_key text; v_title text;
begin
  -- One operation per request; a receipt summarizes exactly one task change.
  if jsonb_typeof(p_ops) is distinct from 'array' or jsonb_array_length(p_ops) <> 1 then
    perform public.companion_fail('CA422', 'invalid_operations');
  end if;
  for v_op in select * from jsonb_array_elements(p_ops) loop
    if jsonb_typeof(v_op) <> 'object' then
      perform public.companion_fail('CA422', 'invalid_operations');
    end if;
    v_type := case when jsonb_typeof(v_op->'type') = 'string' then v_op->>'type' end;
    -- #366: steps have their own registry check.
    if v_type like 'step.%' then
      perform public.companion_step_validate(v_op);
      continue;
    end if;
    -- #370: saved details have their own registry check.
    if v_type like 'detail.%' then
      perform public.companion_detail_validate(v_op);
      continue;
    end if;
    -- #367: a reviewed removal and the reviewed restore of a conflicting removal Undo.
    if v_type in ('task.remove', 'task.restore') then
      for v_key in select jsonb_object_keys(v_op) loop
        if v_key not in ('type', 'task_ref', 'expected_revision') then
          perform public.companion_fail('CA422', 'unknown_field', jsonb_build_object('field', v_key));
        end if;
      end loop;
      v_ref := case when jsonb_typeof(v_op->'task_ref') = 'string' then v_op->>'task_ref' end;
      if v_ref is null or not public.companion_task_ref_valid(v_ref) then
        perform public.companion_fail('CA422', 'invalid_task_ref');
      end if;
      if public.companion_nonneg_int(v_op->'expected_revision', 15) is null then
        perform public.companion_fail('CA422', 'expected_revision_required');
      end if;
      continue;
    end if;
    if v_type is null or v_type not in ('task.set_state', 'task.create_custom', 'task.remove_created', 'task.edit_details') then
      perform public.companion_fail('CA422', 'unsupported_operation', jsonb_build_object('type', v_type));
    end if;
    if v_type = 'task.edit_details' then
      -- Title, description and priority of one custom task. Only the given fields change.
      for v_key in select jsonb_object_keys(v_op) loop
        if v_key not in ('type', 'task_ref', 'expected_revision', 'title', 'description', 'priority') then
          perform public.companion_fail('CA422', 'unknown_field', jsonb_build_object('field', v_key));
        end if;
      end loop;
      v_ref := case when jsonb_typeof(v_op->'task_ref') = 'string' then v_op->>'task_ref' end;
      if v_ref is null or not public.companion_task_ref_valid(v_ref) then
        perform public.companion_fail('CA422', 'invalid_task_ref');
      end if;
      -- A content-backed task's title, description and priority are shared content.
      if v_ref like 'sanity:%' then
        perform public.companion_fail('CA422', 'shared_task_field', jsonb_build_object('task_ref', v_ref));
      end if;
      if public.companion_nonneg_int(v_op->'expected_revision', 15) is null then
        perform public.companion_fail('CA422', 'expected_revision_required');
      end if;
      if not (v_op ? 'title' or v_op ? 'description' or v_op ? 'priority') then
        perform public.companion_fail('CA422', 'invalid_operations');
      end if;
      if v_op ? 'title' and not public.companion_valid_title(v_op->'title') then
        perform public.companion_fail('CA422', 'invalid_title');
      end if;
      if v_op ? 'description' and not public.companion_valid_description(v_op->'description') then
        perform public.companion_fail('CA422', 'invalid_description');
      end if;
      if v_op ? 'priority' and (jsonb_typeof(v_op->'priority') is distinct from 'string'
         or (v_op->>'priority') not in ('Do now', 'Do soon', 'Explore and connect', 'Optional / later')) then
        perform public.companion_fail('CA422', 'invalid_priority');
      end if;
      continue;
    end if;
    if v_type = 'task.create_custom' then
      for v_key in select jsonb_object_keys(v_op) loop
        if v_key not in ('type', 'title', 'priority') then
          perform public.companion_fail('CA422', 'unknown_field', jsonb_build_object('field', v_key));
        end if;
      end loop;
      v_title := case when jsonb_typeof(v_op->'title') = 'string' then v_op->>'title' end;
      -- One line of plain text, already trimmed: the stored title is exactly what was reviewed.
      if v_title is null or v_title <> btrim(v_title) or char_length(v_title) not between 1 and 200
         or v_title ~ '[[:cntrl:]]' then
        perform public.companion_fail('CA422', 'invalid_title');
      end if;
      if jsonb_typeof(v_op->'priority') is distinct from 'string'
         or (v_op->>'priority') not in ('Do now', 'Do soon', 'Explore and connect', 'Optional / later') then
        perform public.companion_fail('CA422', 'invalid_priority');
      end if;
      continue;
    end if;
    if v_type = 'task.remove_created' then
      -- The inverse of a create: only a custom task, at the revision the caller saw.
      for v_key in select jsonb_object_keys(v_op) loop
        if v_key not in ('type', 'task_ref', 'expected_revision') then
          perform public.companion_fail('CA422', 'unknown_field', jsonb_build_object('field', v_key));
        end if;
      end loop;
      v_ref := case when jsonb_typeof(v_op->'task_ref') = 'string' then v_op->>'task_ref' end;
      if v_ref is null or not public.companion_task_ref_valid(v_ref) or v_ref not like 'custom:%' then
        perform public.companion_fail('CA422', 'invalid_task_ref');
      end if;
      if public.companion_nonneg_int(v_op->'expected_revision', 15) is null then
        perform public.companion_fail('CA422', 'expected_revision_required');
      end if;
      continue;
    end if;
    for v_key in select jsonb_object_keys(v_op) loop
      if v_key not in ('type', 'task_ref', 'state', 'waiting_reason', 'expected_revision') then
        perform public.companion_fail('CA422', 'unknown_field', jsonb_build_object('field', v_key));
      end if;
    end loop;
    v_ref := case when jsonb_typeof(v_op->'task_ref') = 'string' then v_op->>'task_ref' end;
    if v_ref is null or not public.companion_task_ref_valid(v_ref) then
      perform public.companion_fail('CA422', 'invalid_task_ref');
    end if;
    if public.companion_nonneg_int(v_op->'expected_revision', 15) is null then
      perform public.companion_fail('CA422', 'expected_revision_required');
    end if;
    if jsonb_typeof(v_op->'state') is distinct from 'string'
       or (v_op->>'state') not in ('not_started', 'in_progress', 'waiting', 'completed') then
      perform public.companion_fail('CA422', 'invalid_state');
    end if;
    if v_op ? 'waiting_reason' and (jsonb_typeof(v_op->'waiting_reason') <> 'string'
       or (v_op->>'state') <> 'waiting'
       or char_length(btrim(v_op->>'waiting_reason')) not between 1 and 500) then
      perform public.companion_fail('CA422', 'invalid_waiting_reason');
    end if;
  end loop;
end $$;

create or replace function public.companion_check_authorization(p_user uuid, p_ops jsonb, p_auth jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_kind text := case when jsonb_typeof(p_auth) = 'object' and jsonb_typeof(p_auth->'kind') = 'string' then p_auth->>'kind' end;
  v_creates boolean := exists (select 1 from jsonb_array_elements(p_ops) o where o->>'type' = 'task.create_custom');
  v_removes boolean := exists (select 1 from jsonb_array_elements(p_ops) o where o->>'type' = 'task.remove_created');
  v_edits boolean := exists (select 1 from jsonb_array_elements(p_ops) o where o->>'type' = 'task.edit_details');
  v_rev bigint;
  v_msg bigint;
  v_prop uuid;
  v_undo_of uuid;
begin
  -- #370: a saved-detail operation has its own authorization rules.
  if p_ops->0->>'type' like 'detail.%' then
    return public.companion_detail_authorization(p_user, p_ops, p_auth);
  end if;
  -- #367: removing a task is only the approval of its reviewed removal draft, with the
  -- user's confirmation; restoring one is only the reviewed change of a conflicting Undo
  -- of the receipt that removed it. No control, command or model evidence does either.
  if exists (select 1 from jsonb_array_elements(p_ops) o where o->>'type' in ('task.remove', 'task.restore')) then
    if v_kind is distinct from 'approved_proposal' then
      perform public.companion_fail('CA403', 'invalid_authorization');
    end if;
    if p_ops->0->>'type' = 'task.remove'
       and (jsonb_typeof(p_auth->'removal_confirmed') is distinct from 'boolean'
            or (p_auth->>'removal_confirmed')::boolean is not true) then
      perform public.companion_fail('CA403', 'removal_requires_confirmation');
    end if;
    v_rev := public.companion_nonneg_int(p_auth->'proposal_revision', 9);
    if v_rev is null or jsonb_typeof(p_auth->'proposal_id') is distinct from 'string'
       or (p_auth->>'proposal_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      perform public.companion_fail('CA403', 'invalid_authorization');
    end if;
    update public.companion_proposals p set status = 'applied', updated_at = now()
     where p.id = (p_auth->>'proposal_id')::uuid and p.user_id = p_user
       and p.revision = v_rev::int
       and p.operations_hash = public.companion_ops_hash(p_ops) and p.status = 'draft'
       and p.kind = case when p_ops->0->>'type' = 'task.remove' then 'task_remove' else 'compensation' end
     returning p.id, p.undo_of into v_prop, v_undo_of;
    if v_prop is null then
      perform public.companion_fail('CA403', 'invalid_authorization');
    end if;
    if p_ops->0->>'type' = 'task.restore' and not exists (
      select 1 from public.companion_action_receipts r
       where r.user_id = p_user and r.operation_id = v_undo_of
         and r.outcome->'results'->0->>'type' = 'task.remove'
         and r.task_ref = p_ops->0->>'task_ref') then
      perform public.companion_fail('CA403', 'invalid_authorization');
    end if;
    return v_undo_of;
  end if;
  -- #366 steps. Every step removal needs the user's confirmation. A direct control adds
  -- exactly the one step the user typed; restoring a step or removing an added set is
  -- only the reviewed change of an Undo.
  if exists (select 1 from jsonb_array_elements(p_ops) o where o->>'type' in ('step.remove', 'step.remove_created'))
     and (jsonb_typeof(p_auth->'removal_confirmed') is distinct from 'boolean'
          or (p_auth->>'removal_confirmed')::boolean is not true) then
    perform public.companion_fail('CA403', 'removal_requires_confirmation');
  end if;
  if v_kind = 'ui_control' and exists (select 1 from jsonb_array_elements(p_ops) o
       where o->>'type' in ('step.restore', 'step.remove_created')
          or (o->>'type' = 'step.create' and jsonb_array_length(o->'titles') <> 1)) then
    perform public.companion_fail('CA403', 'invalid_authorization');
  end if;
  -- Every removal needs the user's explicit confirmation, and is only the reviewed
  -- compensating change of an Undo (below). A command never removes.
  if v_removes and (v_kind is distinct from 'approved_proposal'
                    or jsonb_typeof(p_auth->'removal_confirmed') is distinct from 'boolean'
                    or (p_auth->>'removal_confirmed')::boolean is not true) then
    perform public.companion_fail('CA403', 'removal_requires_confirmation');
  end if;
  if v_kind = 'ui_control' then
    if v_creates or v_edits then
      perform public.companion_fail('CA403', 'invalid_authorization');
    end if;
    return null;
  elsif v_kind = 'direct_command' then
    v_msg := public.companion_nonneg_int(p_auth->'message_id', 9);
    -- A command makes one task change of a type the action service resolves from
    -- message text: an added task, a details edit or a state change (#365).
    if v_msg is null
       or exists (select 1 from jsonb_array_elements(p_ops) o
                   where o->>'type' not in ('task.create_custom', 'task.edit_details', 'task.set_state'))
       or exists (select 1 from jsonb_object_keys(p_auth) k where k not in ('kind', 'message_id'))
       or not exists (select 1 from public.messages m join public.conversations c on c.id = m.conversation_id
                       where m.id = v_msg::int and c.user_id = p_user and m.role = 'user') then
      perform public.companion_fail('CA403', 'invalid_authorization');
    end if;
    begin
      insert into public.companion_command_uses (user_id, message_id, operation_id)
      values (p_user, v_msg, coalesce(nullif(current_setting('companion.operation_id', true), '')::uuid, gen_random_uuid()));
    exception when unique_violation then
      perform public.companion_fail('CA412', 'command_already_used');
    end;
    if v_creates and jsonb_array_length(public.companion_same_title_tasks(p_user, p_ops->0->>'title')) > 0 then
      perform public.companion_fail('CA413', 'needs_clarification',
        jsonb_build_object('same_title_tasks', public.companion_same_title_tasks(p_user, p_ops->0->>'title')));
    end if;
    return null;
  elsif v_kind = 'approved_proposal' then
    v_rev := public.companion_nonneg_int(p_auth->'proposal_revision', 9);
    if v_rev is null or jsonb_typeof(p_auth->'proposal_id') is distinct from 'string'
       or (p_auth->>'proposal_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      perform public.companion_fail('CA403', 'invalid_authorization');
    end if;
    update public.companion_proposals p set status = 'applied', updated_at = now()
     where p.id = (p_auth->>'proposal_id')::uuid and p.user_id = p_user
       and p.revision = v_rev::int
       and p.operations_hash = public.companion_ops_hash(p_ops) and p.status = 'draft'
     returning p.id, p.undo_of into v_prop, v_undo_of;
    if v_prop is null then
      perform public.companion_fail('CA403', 'invalid_authorization');
    end if;
    -- A removal is allowed only as the compensating change of an Undo of the receipt
    -- that added exactly this task.
    if v_removes and not exists (
      select 1 from public.companion_action_receipts r
       where r.user_id = p_user and r.operation_id = v_undo_of
         and r.outcome->'results'->0->>'type' = 'task.create_custom'
         and r.task_ref = p_ops->0->>'task_ref') then
      perform public.companion_fail('CA403', 'invalid_authorization');
    end if;
    -- #366: removing an added set of steps is only the reviewed change of the Undo of
    -- the receipt that added those steps.
    if exists (select 1 from jsonb_array_elements(p_ops) o where o->>'type' = 'step.remove_created')
       and not exists (
         select 1 from public.companion_action_receipts r
          where r.user_id = p_user and r.operation_id = v_undo_of
            and r.outcome->'results'->0->>'type' = 'step.create'
            and r.task_ref = p_ops->0->>'task_ref'
            and not exists (select 1 from jsonb_array_elements(p_ops->0->'steps') s
                             where not exists (select 1 from jsonb_array_elements(r.outcome->'results'->0->'steps') c
                                                where c->>'step_id' = s->>'step_id'))) then
      perform public.companion_fail('CA403', 'invalid_authorization');
    end if;
    return v_undo_of;
  end if;
  perform public.companion_fail('CA403', 'invalid_authorization');
  return null;
end $$;

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
  -- #367: a reviewed removal and its reviewed restore are executed by the removal domain.
  if p_op->>'type' = 'task.remove' then
    return public.companion_remove_task(p_user, p_op);
  elsif p_op->>'type' = 'task.restore' then
    return public.companion_restore_task(p_user, p_op);
  end if;
  -- #366: a step operation is executed by the step domain.
  if p_op->>'type' like 'step.%' then
    return public.companion_apply_step(p_user, p_op);
  end if;
  -- #370: a saved-detail operation is executed by the detail domain.
  if p_op->>'type' like 'detail.%' then
    return public.companion_apply_detail(p_user, p_op);
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
    -- #370: a detail receipt names the text it saved (and the text before an edit), and is
    -- current while the detail is still at the revision it produced. It has no task.
    || case when r->>'type' like 'detail.%' then
         jsonb_build_object('detail', jsonb_build_object('detail_id', r->'detail_id', 'text', r->'text',
                              'before_text', r->'before_text', 'removed', coalesce(r->'removed', 'false'::jsonb)),
           'current', u.operation_id is null and exists (
             select 1 from public.companion_saved_details d
              where d.user_id = p_receipt.user_id and d.id = (r->>'detail_id')::uuid
                and d.revision = (r->>'after_revision')::bigint))
       else '{}'::jsonb end
  from (select p_receipt.outcome->'results'->0 as r) x
  left join public.companion_action_receipts u
    on u.user_id = p_receipt.user_id and u.undo_of = p_receipt.operation_id
$$;

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
  -- #370: a detail receipt is reversed by the detail domain.
  if v_target.outcome->'results'->0->>'type' like 'detail.%' then
    return public.companion_undo_detail(p_user_id, p_operation_id, v_hash, p_contract_version, p_authorization, v_target);
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

create or replace function public.companion_prepare_proposal(p_user_id uuid, p_operations jsonb, p_source jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prop public.companion_proposals%rowtype;
begin
  perform public.companion_validate_operations(p_operations);
  -- #367: a removal review names the task and its current effects.
  if p_operations->0->>'type' = 'task.remove' then
    return public.companion_remove_prepare(p_user_id, p_operations->0->>'task_ref', p_source);
  end if;
  if p_operations->0->>'type' not in ('task.create_custom', 'step.create', 'detail.create') then
    perform public.companion_fail('CA422', 'unsupported_operation', jsonb_build_object('type', p_operations->0->>'type'));
  end if;
  -- #366: suggested steps need a live, unfinished task of this account.
  if p_operations->0->>'type' = 'step.create' then
    perform public.companion_step_parent(p_user_id, p_operations->0->>'task_ref');
  end if;
  -- #370: a suggested detail belongs to the caller's conversation (its provenance) and
  -- is not drafted again when the same text is already saved.
  if p_operations->0->>'type' = 'detail.create' then
    if p_source is null or jsonb_typeof(p_source) = 'null' then
      perform public.companion_fail('CA422', 'invalid_source');
    end if;
    if jsonb_array_length(public.companion_same_text_details(p_user_id, p_operations->0->>'text')) > 0 then
      perform public.companion_fail('CA414', 'detail_exists',
        jsonb_build_object('same_text_details', public.companion_same_text_details(p_user_id, p_operations->0->>'text')));
    end if;
  end if;
  insert into public.companion_proposals (user_id, operations, operations_hash, kind, context, source, updated_at)
  values (p_user_id, p_operations, public.companion_ops_hash(p_operations),
          case p_operations->0->>'type' when 'step.create' then 'step_create'
                                         when 'detail.create' then 'detail_create' else 'task_create' end,
          public.companion_proposal_context(p_user_id, p_operations),
          public.companion_check_source(p_user_id, p_source), now())
  returning * into v_prop;
  return public.companion_proposal_view(v_prop);
end $$;

create or replace function public.companion_recheck_proposal(p_user uuid, p_ops jsonb, p_auth jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prop public.companion_proposals%rowtype;
  v_now jsonb;
begin
  if jsonb_typeof(p_auth) is distinct from 'object' or p_auth->>'kind' is distinct from 'approved_proposal'
     or jsonb_typeof(p_auth->'proposal_id') is distinct from 'string'
     or (p_auth->>'proposal_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return null;
  end if;
  -- The row lock also orders competing approvals of this proposal.
  select * into v_prop from public.companion_proposals
   where id = (p_auth->>'proposal_id')::uuid and user_id = p_user for update;
  -- Anything that is not exactly the reviewed draft is refused by the authorization check.
  if not found or coalesce(v_prop.kind, '') not in ('task_create', 'step_create', 'detail_create', 'task_remove') or v_prop.status <> 'draft'
     or v_prop.revision is distinct from public.companion_nonneg_int(p_auth->'proposal_revision', 9)
     or v_prop.operations_hash <> public.companion_ops_hash(p_ops) then
    return null;
  end if;
  -- #367: a removal review reads the task and its effects again after the parent lock and
  -- the task row lock, which every step write, legacy completion/removal and task write
  -- takes, and which are held until the removal commits.
  if v_prop.kind = 'task_remove' then
    return public.companion_remove_recheck(p_user, v_prop);
  end if;
  -- #366: suggested steps read their context after the parent lock, which every step
  -- change of the task takes and which is held until the steps are inserted. A matching
  -- step that committed while this approval waited is read here and needs a new review.
  if v_prop.kind = 'step_create' then
    perform public.companion_step_parent_lock(p_user, p_ops->0->>'task_ref');
  end if;
  -- #370: a suggested detail reads its context (the same text already saved) after the
  -- details lock, which every add, edit and restore takes and holds until it commits.
  if v_prop.kind = 'detail_create' then
    perform public.companion_details_lock(p_user);
  end if;
  v_now := public.companion_proposal_context(p_user, p_ops);
  if v_prop.context is not null and v_now = v_prop.context then
    return null;
  end if;
  update public.companion_proposals
     set revision = revision + 1, previous_context = context, context = v_now,
         review_reason = 'context_changed', updated_at = now()
   where id = v_prop.id
  returning * into v_prop;
  return public.companion_proposal_view(v_prop);
end $$;

create or replace function public.companion_conversation_actions(p_user_id uuid, p_conversation_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_conv integer;
begin
  select c.id into v_conv from public.conversations c
   where c.conversation_identifier = p_conversation_id and c.user_id = p_user_id;
  if not found then
    perform public.companion_fail('CA404', 'conversation_not_found');
  end if;
  return jsonb_build_object(
    'proposals', (select coalesce(jsonb_agg(public.companion_proposal_view(p) order by p.created_at), '[]'::jsonb)
                    from public.companion_proposals p
                   where p.user_id = p_user_id and p.kind in ('task_create', 'step_create', 'task_edit', 'task_remove')
                     and p.source->>'conversation_id' = p_conversation_id::text),
    'commands', (select coalesce(jsonb_agg(jsonb_build_object(
                          'message_id', u.message_id, 'operation_id', u.operation_id,
                          'receipt', public.companion_receipt_summary(r)) order by u.created_at), '[]'::jsonb)
                   from public.companion_command_uses u
                   join public.messages m on m.id = u.message_id and m.conversation_id = v_conv
                   join public.companion_action_receipts r on r.user_id = u.user_id and r.operation_id = u.operation_id
                  where u.user_id = p_user_id
                    -- #370: detail results are listed under detail_commands (older clients
                    -- read every entry here as a task receipt).
                    and coalesce(r.outcome->'results'->0->>'type', '') not like 'detail.%'),
    -- #370: suggested-detail drafts and remember results of this conversation.
    'detail_proposals', (select coalesce(jsonb_agg(public.companion_proposal_view(p) order by p.created_at), '[]'::jsonb)
                           from public.companion_proposals p
                          where p.user_id = p_user_id and p.kind = 'detail_create'
                            and p.source->>'conversation_id' = p_conversation_id::text),
    'detail_commands', (select coalesce(jsonb_agg(jsonb_build_object(
                                 'message_id', u.message_id, 'operation_id', u.operation_id,
                                 'receipt', public.companion_receipt_summary(r)) order by u.created_at), '[]'::jsonb)
                          from public.companion_command_uses u
                          join public.messages m on m.id = u.message_id and m.conversation_id = v_conv
                          join public.companion_action_receipts r on r.user_id = u.user_id and r.operation_id = u.operation_id
                         where u.user_id = p_user_id
                           and r.outcome->'results'->0->>'type' like 'detail.%'));
end $$;

-- ------------------------------------------------------------------ plan writer (#364)
-- The accepted #364 body verbatim with one marked #367 line: a plan approval (and the
-- approval of a reviewed retry it dispatches) takes the plan-reference locks of the
-- existing tasks it refers to before it reads their availability.
create or replace function public.companion_plan_apply(
  p_user_id uuid, p_operation_id uuid, p_contract_version integer, p_authorization jsonb, p_items jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_hash text;
  v_receipt public.companion_action_receipts%rowtype;
  v_prop public.companion_plan_proposals%rowtype;
  v_plan public.companion_plans%rowtype;
  v_item jsonb; v_pos integer; v_res jsonb; v_create jsonb; v_item_op uuid; v_now jsonb;
  v_results jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_authorization) is distinct from 'object' or p_authorization->>'kind' is distinct from 'approved_proposal'
     or jsonb_typeof(p_authorization->'proposal_id') is distinct from 'string'
     or (p_authorization->>'proposal_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or public.companion_nonneg_int(p_authorization->'proposal_revision', 9) is null then
    perform public.companion_fail('CA403', 'invalid_authorization');
  end if;
  v_hash := public.companion_ops_hash(jsonb_build_object('plan_apply', p_authorization->>'proposal_id',
              'revision', p_authorization->'proposal_revision', 'items', p_items));
  -- One writer per (account, operation); a duplicate waits, then replays the receipt.
  perform set_config('lock_timeout', '3s', true);
  perform pg_advisory_xact_lock(public.companion_op_lock_key(p_user_id, p_operation_id));
  select * into v_receipt from public.companion_action_receipts where user_id = p_user_id and operation_id = p_operation_id;
  if found then
    if v_receipt.request_hash <> v_hash then
      perform public.companion_fail('CA410', 'operation_id_reused');
    end if;
    return public.companion_plan_reply(v_receipt, true);
  end if;

  select * into v_prop from public.companion_plan_proposals
   where id = (p_authorization->>'proposal_id')::uuid and user_id = p_user_id for update;
  -- Approved already under another operation id (a competing tap): nothing is written
  -- and the caller gets the saved draft with its receipt.
  if found and v_prop.kind in ('plan', 'retry') and v_prop.status = 'applied' then
    return jsonb_build_object('changed', true, 'plan_proposal', public.companion_plan_proposal_view(v_prop));
  end if;
  if not found or v_prop.status <> 'draft'
     or v_prop.revision <> (p_authorization->>'proposal_revision')::integer
     or v_prop.items_hash <> public.companion_ops_hash(p_items) then
    perform public.companion_fail('CA403', 'invalid_authorization');
  end if;
  -- #367: references to existing tasks are written in order with a removal of any of them;
  -- the relevant context (and a reviewed retry's) is read after this lock.
  perform public.companion_plan_items_lock(p_user_id, v_prop.items);
  if v_prop.kind = 'undo' then
    return public.companion_plan_apply_undo(p_user_id, p_operation_id, v_hash, p_contract_version, p_authorization, v_prop);
  end if;
  if v_prop.kind = 'retry' then
    return public.companion_plan_apply_review(p_user_id, p_operation_id, v_hash, p_contract_version, p_authorization, v_prop);
  end if;
  -- Read the relevant context again. When it changed, the approval is not used: the
  -- draft moves to a new revision with the current context for a new review, and
  -- nothing is written (no receipt either, so the operation stays not applied).
  v_now := public.companion_plan_context(p_user_id, v_prop.items);
  if v_now is distinct from v_prop.context then
    update public.companion_plan_proposals
       set revision = revision + 1, previous_context = context, context = v_now,
           review_reason = 'context_changed', updated_at = now()
     where id = v_prop.id returning * into v_prop;
    return jsonb_build_object('needs_review', true, 'plan_proposal', public.companion_plan_proposal_view(v_prop));
  end if;
  -- A reference to a task removed since preparation is never saved: the user drops it.
  if exists (select 1 from jsonb_array_elements(v_now->'existing') x where not (x->>'available')::boolean) then
    perform public.companion_fail('CA422', 'task_removed');
  end if;
  if jsonb_array_length(public.companion_plan_unresolved(v_prop.items, v_prop.context)) > 0 then
    perform public.companion_fail('CA422', 'match_unresolved');
  end if;

  update public.companion_plan_proposals set status = 'applied', receipt_operation_id = p_operation_id, updated_at = now()
   where id = v_prop.id;
  insert into public.companion_plans (user_id, goal, context, source, proposal_id, operation_id, updated_at)
  values (p_user_id, v_prop.goal, v_prop.context, v_prop.source, v_prop.id, p_operation_id, now())
  returning * into v_plan;

  for v_item, v_pos in select i, n::integer from jsonb_array_elements(v_prop.items) with ordinality e(i, n) loop
    if v_item->>'kind' = 'existing' then
      insert into public.companion_plan_tasks (plan_id, task_ref, position) values (v_plan.id, v_item->>'task_ref', v_pos);
      v_results := v_results || jsonb_build_array(jsonb_build_object('kind', 'existing', 'task_ref', v_item->>'task_ref',
                     'outcome', 'reused') || case when v_item ? 'label' then jsonb_build_object('label', v_item->>'label')
                                                  else '{}'::jsonb end);
    elsif (v_item->>'include')::boolean then
      v_results := v_results || jsonb_build_array(
        public.companion_plan_add_item(p_user_id, p_operation_id, p_contract_version, v_prop, v_plan.id, v_item, v_pos));
    end if;
  end loop;

  insert into public.companion_action_receipts
    (user_id, operation_id, request_hash, contract_version, authorization_evidence, outcome)
  values (p_user_id, p_operation_id, v_hash, p_contract_version, p_authorization,
          jsonb_build_object('kind', 'plan', 'plan_id', v_plan.id, 'goal', v_prop.goal, 'results', v_results))
  returning * into v_receipt;
  return public.companion_plan_reply(v_receipt, false);
end $$;

-- ------------------------------------------------------------------ grants
revoke all on function
  public.companion_plan_ref_key(uuid, text), public.companion_plan_items_lock(uuid, jsonb),
  public.companion_remove_effects(uuid, text), public.companion_remove_lock(uuid, text),
  public.companion_remove_prepare(uuid, text, jsonb),
  public.companion_remove_recheck(uuid, public.companion_proposals),
  public.companion_remove_task(uuid, jsonb), public.companion_restore_task(uuid, jsonb),
  public.companion_undo_remove(uuid, uuid, text, integer, public.companion_action_receipts)
  from public, anon, authenticated;
