-- Companion task edits: a reviewed proposal or a clear direct command changes one
-- existing Checklist task's title, description, priority, state or waiting reason, with a
-- receipt and revision-checked Undo (mobile-app#365). Builds on
-- 20261025235536_companion_task_actions.sql (#361) and 20261026165156_companion_task_create.sql
-- (#363) and keeps their rules: legacy columns stay authoritative, only the action service
-- writes, a full schema rollback stops pending reminders and a re-application restarts none.
--
-- Authority: this repo owns the migration. The web repo mirrors this file byte for byte
-- with the same timestamp. Rollback script (mirrored too):
-- supabase/rollbacks/20261028001530_companion_task_edit.down.sql. Run it before the #363
-- rollback script. Apply through the normal release path with the gate off.
--
-- Where an edit is stored. Title, description and priority of a custom task live in its
-- own custom_checklist_tasks row, which every Checklist (web, mobile, released v1.6.0)
-- already reads with select('*'): an edit shows everywhere with no new column and no
-- client change. A content-backed task's title, description and priority are shared
-- Sanity content: they are not editable per user, so they are refused (shared_task_field)
-- rather than stored as an override no Checklist reads. Its state and waiting reason are
-- the #361 per-user columns of user_tasks.
--
-- Additive: one widened check constraint, new functions, and new versions of #363
-- functions with the same signatures.

-- ------------------------------------------------------------------ proposals
alter table public.companion_proposals drop constraint companion_proposals_kind_check;
alter table public.companion_proposals add constraint companion_proposals_kind_check
  check (kind is null or kind in ('compensation', 'task_create', 'task_edit'));

-- ------------------------------------------ recovery after a rollback (down script)
-- The rollback script archives what only this migration understands into
-- companion_rollback_archive_365. Re-applying puts it back: the edit drafts and the Undo
-- of each edit. Every restored draft moves to a new revision that needs review, so no
-- approval captured before the rollback is used (the #361 rule). Rows of deleted
-- accounts are not restored.
do $recover365$
begin
  if to_regclass('public.companion_rollback_archive_365') is null then
    return;
  end if;
  insert into public.companion_proposals
    select (jsonb_populate_record(null::public.companion_proposals,
              case when a.row_data->>'status' = 'draft'
                   then a.row_data || jsonb_build_object('revision', (a.row_data->>'revision')::int + 1,
                          'review_reason', 'restored', 'previous_context', null, 'updated_at', now())
                   else a.row_data end)).*
      from public.companion_rollback_archive_365 a
     where a.source = 'companion_proposals' and a.restored_at is null
       and exists (select 1 from auth.users u where u.id = (a.row_data->>'user_id')::uuid)
     order by a.id
    on conflict do nothing;
  update public.companion_action_receipts r set inverse = a.row_data->'inverse'
    from public.companion_rollback_archive_365 a
   where a.source = 'companion_action_receipts.inverse' and a.restored_at is null
     and r.user_id = (a.row_data->>'user_id')::uuid and r.operation_id = (a.row_data->>'operation_id')::uuid
     and r.inverse is null;
  update public.companion_rollback_archive_365 set restored_at = now() where restored_at is null;
end $recover365$;

-- ------------------------------------------------------------ shared helpers
-- One line of plain text, already trimmed (as a created title, #363).
create function public.companion_valid_title(p_val jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(p_val) = 'string' and (p_val #>> '{}') = btrim(p_val #>> '{}')
     and char_length(p_val #>> '{}') between 1 and 200 and (p_val #>> '{}') !~ '[[:cntrl:]]'
$$;

-- Plain text that may span lines, already trimmed, possibly empty (clears it).
create function public.companion_valid_description(p_val jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(p_val) = 'string' and (p_val #>> '{}') = btrim(p_val #>> '{}', E' \n\t')
     and char_length(p_val #>> '{}') <= 2000
     and (p_val #>> '{}') !~ '[\x01-\x09\x0b-\x1f\x7f]'
$$;

-- The current values of one task that an edit may depend on. A content-backed task
-- with no row yet is Not started at revision 0. A custom task that is missing (or
-- belongs to another account) is not found. Title, description and priority exist
-- for custom tasks only: a content-backed task's are shared content.
create function public.companion_edit_context(p_user uuid, p_ref text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_us public.user_tasks%rowtype;
  v_ct public.custom_checklist_tasks%rowtype;
begin
  if p_ref is null or not public.companion_task_ref_valid(p_ref) then
    perform public.companion_fail('CA422', 'invalid_task_ref');
  end if;
  if split_part(p_ref, ':', 1) = 'sanity' then
    select * into v_us from public.user_tasks where user_id = p_user and sanity_checklist_id = substr(p_ref, 8);
    return jsonb_build_object('task_ref', p_ref,
      'revision', case when found then v_us.revision else 0 end,
      'removed', found and v_us.dismissed_at is not null,
      'state', case when found then public.companion_task_state(v_us.completed, v_us.progress_state) else 'not_started' end,
      'waiting_reason', case when found then v_us.waiting_reason end);
  end if;
  select * into v_ct from public.custom_checklist_tasks where user_id = p_user and id = substr(p_ref, 8)::bigint;
  if not found then
    perform public.companion_fail('CA404', 'task_not_found', jsonb_build_object('task_ref', p_ref));
  end if;
  return jsonb_build_object('task_ref', p_ref, 'revision', v_ct.revision, 'removed', v_ct.removed_at is not null,
    'state', public.companion_task_state(v_ct.completed, v_ct.progress_state),
    'waiting_reason', v_ct.waiting_reason,
    'title', v_ct.title, 'description', v_ct.description, 'priority', v_ct.priority);
end $$;

-- The values of `p_context` an operation depends on: the fields it changes. A change to
-- any other field of the task (or to another task) is not relevant to its approval.
create function public.companion_edit_relevant(p_op jsonb, p_context jsonb) returns jsonb
language sql immutable as $$
  select case when p_op->>'type' = 'task.set_state'
              then jsonb_build_object('removed', p_context->'removed', 'state', p_context->'state',
                                      'waiting_reason', p_context->'waiting_reason')
              else jsonb_build_object('removed', p_context->'removed')
                   || (select coalesce(jsonb_object_agg(k, p_context->k), '{}'::jsonb)
                         from unnest(array['title', 'description', 'priority']) k where p_op ? k) end
$$;

-- The one canonical spelling of an edit draft, at the task's current revision. A Waiting
-- draft without a reason keeps the reason a waiting task already has: naming the state
-- does not erase what the user wrote. Raises when the task is removed, and no_change when
-- the draft would leave every value as it is.
create function public.companion_edit_operation(p_user uuid, p_draft jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_ref text := case when jsonb_typeof(p_draft->'task_ref') = 'string' then p_draft->>'task_ref' end;
  v_ctx jsonb;
  v_op jsonb;
  v_key text;
begin
  if jsonb_typeof(p_draft) is distinct from 'object' or p_draft ? 'expected_revision' then
    perform public.companion_fail('CA422', case when p_draft ? 'expected_revision' then 'unknown_field' else 'invalid_operations' end);
  end if;
  v_ctx := public.companion_edit_context(p_user, v_ref);
  if (v_ctx->>'removed')::boolean then
    perform public.companion_fail('CA422', 'task_removed', jsonb_build_object('task_ref', v_ref));
  end if;
  v_op := p_draft || jsonb_build_object('expected_revision', (v_ctx->>'revision')::bigint);
  if v_op->>'type' = 'task.set_state' then
    if v_op->>'state' = 'waiting' and not v_op ? 'waiting_reason' and v_ctx->>'state' = 'waiting'
       and v_ctx->>'waiting_reason' is not null then
      v_op := v_op || jsonb_build_object('waiting_reason', v_ctx->>'waiting_reason');
    end if;
    perform public.companion_validate_operations(jsonb_build_array(v_op));
    if v_op->>'state' = v_ctx->>'state' and v_op->>'waiting_reason' is not distinct from v_ctx->>'waiting_reason' then
      perform public.companion_fail('CA422', 'no_change', jsonb_build_object('task_ref', v_ref));
    end if;
    return public.companion_set_state_op(v_ref, v_op->>'state', v_op->>'waiting_reason', (v_ctx->>'revision')::bigint);
  end if;
  perform public.companion_validate_operations(jsonb_build_array(v_op));
  if v_op->>'type' <> 'task.edit_details' then
    perform public.companion_fail('CA422', 'unsupported_operation', jsonb_build_object('type', v_op->>'type'));
  end if;
  if not exists (select 1 from unnest(array['title', 'description', 'priority']) k
                  where v_op ? k and v_op->>k is distinct from v_ctx->>k) then
    perform public.companion_fail('CA422', 'no_change', jsonb_build_object('task_ref', v_ref));
  end if;
  -- Canonical: only the fields that change, in a fixed key order (jsonb sorts keys).
  for v_key in select k from unnest(array['title', 'description', 'priority']) k loop
    if v_op ? v_key and v_op->>v_key = v_ctx->>v_key then v_op := v_op - v_key; end if;
  end loop;
  return v_op;
end $$;

-- ------------------------------------------------------------ registry check
-- Implemented operation types: task.set_state (#361), task.create_custom and
-- task.remove_created (#363), task.edit_details (#365).
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

-- --------------------------------------------------------- authorization
-- ui_control: the signed-in user's own explicit control (task state changes only; it
-- never adds a task or edits a task's details).
-- approved_proposal: a draft proposal of this account with this revision whose hash
-- equals the submitted operations; checked and consumed in one statement.
-- direct_command: the caller's own saved user message: a create (#363), or a state change
-- or details edit of one named task (#365). The action service has already resolved its
-- text to exactly these operations; here the message is checked again and used once, and
-- a create is refused when a live task already has the title. A command never removes.
-- Anything else, including a model-supplied approval flag, is refused. Returns the
-- consumed proposal's undo_of, if any.
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
    if v_msg is null
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
    return v_undo_of;
  end if;
  perform public.companion_fail('CA403', 'invalid_authorization');
  return null;
end $$;

-- ------------------------------------------------------------------ executor
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

  return jsonb_build_object(
    'type', 'task.set_state', 'task_ref', v_ref,
    'before_state', v_before_state, 'state', v_state,
    'before_revision', v_before, 'after_revision', v_after,
    'inverse', public.companion_set_state_op(v_ref, v_before_state, v_before_reason, v_after));
end $$;

-- ------------------------------------------------------------------ receipts
-- Public summary of a receipt. For an added or removed task (#363), the title recorded
-- when it was saved. For an edit (#365), the title the task had after it and each changed
-- field with the value before and after: history, so a later edit changes the task, not
-- this record; `current` says whether it still describes the task.
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
  from (select p_receipt.outcome->'results'->0 as r) x
  left join public.companion_action_receipts u
    on u.user_id = p_receipt.user_id and u.undo_of = p_receipt.operation_id
$$;

-- ----------------------------------------------------------------- proposals
-- Prepare an edit draft: the canonical operation at the task's current revision and the
-- values it changes from. Writes only the proposal row, never task progress. p_title is
-- the display title of a content-backed task, read by the action service from the
-- account's own Checklist (display only, never compared for approval).
create function public.companion_prepare_edit(p_user_id uuid, p_draft jsonb, p_source jsonb, p_title text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_op jsonb := public.companion_edit_operation(p_user_id, p_draft);
  v_ctx jsonb := public.companion_edit_context(p_user_id, v_op->>'task_ref');
  v_prop public.companion_proposals%rowtype;
begin
  if v_op->>'task_ref' like 'sanity:%' and p_title is not null then
    v_ctx := v_ctx || jsonb_build_object('title', left(p_title, 200));
  end if;
  insert into public.companion_proposals (user_id, operations, operations_hash, kind, context, source, updated_at)
  values (p_user_id, jsonb_build_array(v_op), public.companion_ops_hash(jsonb_build_array(v_op)), 'task_edit',
          jsonb_build_object('task', v_ctx), public.companion_check_source(p_user_id, p_source), now())
  returning * into v_prop;
  return public.companion_proposal_view(v_prop);
end $$;

-- Before an approved edit proposal is used, read the task again. Returns null to go on
-- with the submitted operations; { ops } to apply the same change at the task's current
-- revision (only unrelated fields changed: no new approval); or { needs_review, proposal }
-- when a value the change depends on changed: nothing is written, and the proposal moves
-- to a new revision at the current values for a new review.
create function public.companion_recheck_edit(p_user uuid, p_ops jsonb, p_auth jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prop public.companion_proposals%rowtype;
  v_now jsonb;
  v_op jsonb := p_ops->0;
  v_rebased jsonb;
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
  if not found or v_prop.kind is distinct from 'task_edit' or v_prop.status <> 'draft'
     or v_prop.revision is distinct from public.companion_nonneg_int(p_auth->'proposal_revision', 9)
     or v_prop.operations_hash <> public.companion_ops_hash(p_ops) then
    return null;
  end if;
  -- Lock the task row so the comparison holds until the write.
  if v_op->>'task_ref' like 'custom:%' then
    perform 1 from public.custom_checklist_tasks
     where user_id = p_user and id = substr(v_op->>'task_ref', 8)::bigint for update;
  else
    perform 1 from public.user_tasks
     where user_id = p_user and sanity_checklist_id = substr(v_op->>'task_ref', 8) for update;
  end if;
  v_now := public.companion_edit_context(p_user, v_op->>'task_ref');
  if (v_now->>'removed')::boolean then
    perform public.companion_fail('CA422', 'task_removed', jsonb_build_object('task_ref', v_op->>'task_ref'));
  end if;
  v_rebased := v_op || jsonb_build_object('expected_revision', (v_now->>'revision')::bigint);
  if public.companion_edit_relevant(v_op, v_now) = public.companion_edit_relevant(v_op, v_prop.context->'task') then
    if (v_now->>'revision')::bigint = (v_op->>'expected_revision')::bigint then
      return null;
    end if;
    return jsonb_build_object('ops', jsonb_build_array(v_rebased));
  end if;
  if v_op->>'task_ref' like 'sanity:%' and v_prop.context->'task' ? 'title' then
    v_now := v_now || jsonb_build_object('title', v_prop.context->'task'->'title');
  end if;
  update public.companion_proposals
     set revision = revision + 1, operations = jsonb_build_array(v_rebased),
         operations_hash = public.companion_ops_hash(jsonb_build_array(v_rebased)),
         previous_context = context, context = jsonb_build_object('task', v_now),
         review_reason = 'context_changed', updated_at = now()
   where id = v_prop.id
  returning * into v_prop;
  return jsonb_build_object('needs_review', true, 'proposal', public.companion_proposal_view(v_prop));
end $$;

-- ------------------------------------------------------------------- apply
create or replace function public.companion_apply_actions(
  p_user_id uuid, p_operation_id uuid, p_contract_version integer, p_authorization jsonb, p_operations jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_hash text := public.companion_ops_hash(p_operations);
  v_replay jsonb;
  v_undo_of uuid;
  v_results jsonb := '[]'::jsonb;
  v_op jsonb;
  v_reply jsonb;
  v_review jsonb;
  v_edit jsonb;
  v_exec jsonb := p_operations;
begin
  v_replay := public.companion_replay(p_user_id, p_operation_id, v_hash);
  if v_replay is not null then return v_replay; end if;
  perform public.companion_validate_operations(p_operations);
  -- Changed relevant context: nothing is written and no receipt is recorded; the
  -- refreshed proposal needs a new approval (a new operation).
  v_review := public.companion_recheck_proposal(p_user_id, p_operations, p_authorization);
  if v_review is not null then
    return jsonb_build_object('needs_review', true, 'proposal', v_review);
  end if;
  v_edit := public.companion_recheck_edit(p_user_id, p_operations, p_authorization);
  if v_edit ? 'needs_review' then
    return v_edit;
  elsif v_edit ? 'ops' then
    v_exec := v_edit->'ops';
  end if;
  perform set_config('companion.operation_id', p_operation_id::text, true);
  -- Authorization binds to the submitted (reviewed) operations.
  v_undo_of := public.companion_check_authorization(p_user_id, p_operations, p_authorization);
  -- Any failure below raises and rolls back every operation, the consumed approval and the receipt.
  for v_op in select * from jsonb_array_elements(v_exec) loop
    v_results := v_results || jsonb_build_array(public.companion_apply_one(p_user_id, v_op));
  end loop;
  v_reply := public.companion_record(p_user_id, p_operation_id, v_hash, p_contract_version,
                                     p_authorization, v_results, v_undo_of);
  if p_authorization->>'kind' = 'approved_proposal' then
    update public.companion_proposals set receipt_operation_id = p_operation_id, updated_at = now()
     where id = (p_authorization->>'proposal_id')::uuid and user_id = p_user_id;
  end if;
  return v_reply;
end $$;

-- What a conversation produced: its task drafts and edit drafts (any status) and the
-- results of its clear commands, each with current state, so a reopened conversation
-- shows them.
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
                   where p.user_id = p_user_id and p.kind in ('task_create', 'task_edit')
                     and p.source->>'conversation_id' = p_conversation_id::text),
    'commands', (select coalesce(jsonb_agg(jsonb_build_object(
                          'message_id', u.message_id, 'operation_id', u.operation_id,
                          'receipt', public.companion_receipt_summary(r)) order by u.created_at), '[]'::jsonb)
                   from public.companion_command_uses u
                   join public.messages m on m.id = u.message_id and m.conversation_id = v_conv
                   join public.companion_action_receipts r on r.user_id = u.user_id and r.operation_id = u.operation_id
                  where u.user_id = p_user_id));
end $$;

-- Not now: the user closes a draft (a new task or an edit) without applying it. Only the
-- displayed revision of a draft; anything else changes nothing and returns the current
-- proposal.
create or replace function public.companion_cancel_proposal(p_user_id uuid, p_proposal_id uuid, p_proposal_revision integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prop public.companion_proposals%rowtype;
begin
  select * into v_prop from public.companion_proposals
   where id = p_proposal_id and user_id = p_user_id and kind in ('task_create', 'task_edit') for update;
  if not found then
    perform public.companion_fail('CA404', 'proposal_not_found');
  end if;
  if v_prop.status <> 'draft' or v_prop.revision <> p_proposal_revision then
    return jsonb_build_object('changed', true, 'proposal', public.companion_proposal_view(v_prop));
  end if;
  update public.companion_proposals set status = 'cancelled', updated_at = now()
   where id = v_prop.id returning * into v_prop;
  return jsonb_build_object('proposal', public.companion_proposal_view(v_prop));
end $$;

-- ------------------------------------------------------------------- undo
-- Undo of one named receipt. Applies the receipt's recorded inverse when every affected
-- task is still at the revision the receipt produced. Otherwise nothing changes: the
-- newer edit is kept and a draft compensating proposal at the current revisions is
-- returned for review ({ conflict: true, ... }). The inverse of a create is a removal:
-- it needs removal_confirmed in the Undo request, and its compensating proposal too. The
-- inverse of an edit (#365) restores the recorded earlier title, description or priority.
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

-- ------------------------------------------------------------------ grants
revoke all on function
  public.companion_valid_title(jsonb), public.companion_valid_description(jsonb),
  public.companion_edit_context(uuid, text), public.companion_edit_relevant(jsonb, jsonb),
  public.companion_edit_operation(uuid, jsonb), public.companion_prepare_edit(uuid, jsonb, jsonb, text),
  public.companion_recheck_edit(uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function
  public.companion_prepare_edit(uuid, jsonb, jsonb, text), public.companion_edit_operation(uuid, jsonb),
  public.companion_edit_context(uuid, text)
  to service_role;
