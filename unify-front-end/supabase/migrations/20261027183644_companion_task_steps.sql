-- Companion task steps: one level of tracked steps under one Checklist task, with the
-- common revision, receipt, lookup and Undo rules (mobile-app#366). Builds on
-- 20261025235536_companion_task_actions.sql (#361: the steps table, its read-only RLS
-- and the reminder policy) and 20261026165156_companion_task_create.sql (#363).
--
-- Authority: this repo owns the migration. The web repo mirrors this file byte for byte
-- with the same timestamp. Rollback script (mirrored too):
-- supabase/rollbacks/20261027183644_companion_task_steps.down.sql. Run it before the
-- #363 rollback. Apply through the normal release path with the gate off.
--
-- Rules:
--   * A step belongs to one live, unfinished task of the account and contains no steps.
--     Its parent is a task ref; no operation names a parent step.
--   * Adding, checking or editing steps never changes the parent's state or revision.
--     Only task.set_state completes a task. A completion keeps every step as it was
--     (done and unfinished) and records the counts in its receipt. Completion and
--     removal still stop pending reminders through the #361 triggers; nothing here
--     restarts a reminder.
--   * A completed or removed task's steps are history: step writes are refused until the
--     task is reopened.
--   * A direct control adds exactly the one step typed; suggested steps are a draft until
--     the reviewed revision is approved. Every removal needs explicit confirmation.
--   * Steps are written only by the action service (service role). Clients read their
--     own rows (#361 policy) and the action service read.
--
-- Additive: no column changes. New functions, a widened proposal kind, and new versions
-- of the shared action functions that keep each accepted body and add marked lines.

alter table public.companion_proposals drop constraint companion_proposals_kind_check;
alter table public.companion_proposals add constraint companion_proposals_kind_check
  check (kind is null or kind in ('compensation', 'task_create', 'step_create'));

-- ------------------------------------------ recovery after a rollback (down script)
-- The rollback script archives step receipts and step drafts to
-- companion_rollback_archive_366. Re-applying puts them back. A restored draft moves to a
-- new revision that needs review, so no approval captured before the rollback is used.
-- Rows of deleted accounts are not restored.
do $recover366$
begin
  if to_regclass('public.companion_rollback_archive_366') is null then
    return;
  end if;
  insert into public.companion_action_receipts
    select (jsonb_populate_record(null::public.companion_action_receipts, a.row_data)).*
      from public.companion_rollback_archive_366 a
     where a.source = 'companion_action_receipts' and a.restored_at is null
       and exists (select 1 from auth.users u where u.id = (a.row_data->>'user_id')::uuid)
     order by a.id
    on conflict do nothing;
  insert into public.companion_proposals
    select (jsonb_populate_record(null::public.companion_proposals,
              case when a.row_data->>'status' = 'draft' and a.row_data->>'kind' = 'step_create'
                   then a.row_data || jsonb_build_object('revision', (a.row_data->>'revision')::int + 1,
                                                         'review_reason', 'restored', 'previous_context', null)
                   else a.row_data end)).*
      from public.companion_rollback_archive_366 a
     where a.source = 'companion_proposals' and a.restored_at is null
       and exists (select 1 from auth.users u where u.id = (a.row_data->>'user_id')::uuid)
     order by a.id
    on conflict do nothing;
  update public.companion_rollback_archive_366 set restored_at = now() where restored_at is null;
end $recover366$;

-- ------------------------------------------------------------ step helpers
-- A plain, already trimmed, one-line title of 1-200 characters.
create function public.companion_step_title_ok(p_val jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(p_val) = 'string' and (p_val #>> '{}') = btrim(p_val #>> '{}')
         and char_length(p_val #>> '{}') between 1 and 200 and (p_val #>> '{}') !~ '[[:cntrl:]]'
$$;

create function public.companion_uuid_ok(p_val jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(p_val) = 'string'
         and (p_val #>> '{}') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;

-- Registry check of one step operation. One level only: a parent is always a task ref,
-- never a step, and no operation names a parent step.
create function public.companion_step_validate(p_op jsonb) returns void
language plpgsql as $$
declare
  v_type text := p_op->>'type';
  v_allowed text[];
  v_key text;
  v_item jsonb;
  v_keys text[] := '{}';
begin
  v_allowed := case v_type
    when 'step.create' then array['type', 'task_ref', 'titles']
    when 'step.update' then array['type', 'step_id', 'title', 'expected_revision']
    when 'step.set_done' then array['type', 'step_id', 'done', 'expected_revision']
    when 'step.remove' then array['type', 'step_id', 'expected_revision']
    when 'step.restore' then array['type', 'step_id', 'expected_revision']
    when 'step.remove_created' then array['type', 'task_ref', 'steps']
  end;
  if v_allowed is null then
    perform public.companion_fail('CA422', 'unsupported_operation', jsonb_build_object('type', v_type));
  end if;
  for v_key in select jsonb_object_keys(p_op) loop
    if not v_key = any(v_allowed) then
      perform public.companion_fail('CA422', 'unknown_field', jsonb_build_object('field', v_key));
    end if;
  end loop;
  if 'task_ref' = any(v_allowed) and (jsonb_typeof(p_op->'task_ref') is distinct from 'string'
                                      or not public.companion_task_ref_valid(p_op->>'task_ref')) then
    perform public.companion_fail('CA422', 'invalid_task_ref');
  end if;
  if 'step_id' = any(v_allowed) and not public.companion_uuid_ok(p_op->'step_id') then
    perform public.companion_fail('CA422', 'invalid_step_id');
  end if;
  if 'expected_revision' = any(v_allowed) and public.companion_nonneg_int(p_op->'expected_revision', 15) is null then
    perform public.companion_fail('CA422', 'expected_revision_required');
  end if;
  if v_type = 'step.create' then
    if jsonb_typeof(p_op->'titles') is distinct from 'array' or jsonb_array_length(p_op->'titles') not between 1 and 10 then
      perform public.companion_fail('CA422', 'invalid_titles');
    end if;
    for v_item in select * from jsonb_array_elements(p_op->'titles') loop
      if not public.companion_step_title_ok(v_item) then
        perform public.companion_fail('CA422', 'invalid_title');
      end if;
      if public.companion_title_key(v_item #>> '{}') = any(v_keys) then
        perform public.companion_fail('CA422', 'invalid_titles');
      end if;
      v_keys := v_keys || public.companion_title_key(v_item #>> '{}');
    end loop;
  elsif v_type = 'step.update' then
    if not public.companion_step_title_ok(p_op->'title') then
      perform public.companion_fail('CA422', 'invalid_title');
    end if;
  elsif v_type = 'step.set_done' then
    if jsonb_typeof(p_op->'done') is distinct from 'boolean' then
      perform public.companion_fail('CA422', 'invalid_done');
    end if;
  elsif v_type = 'step.remove_created' then
    if jsonb_typeof(p_op->'steps') is distinct from 'array' or jsonb_array_length(p_op->'steps') not between 1 and 10 then
      perform public.companion_fail('CA422', 'invalid_steps');
    end if;
    for v_item in select * from jsonb_array_elements(p_op->'steps') loop
      if jsonb_typeof(v_item) is distinct from 'object' or not public.companion_uuid_ok(v_item->'step_id')
         or public.companion_nonneg_int(v_item->'expected_revision', 15) is null
         or exists (select 1 from jsonb_object_keys(v_item) k where k not in ('step_id', 'expected_revision')) then
        perform public.companion_fail('CA422', 'invalid_steps');
      end if;
    end loop;
  end if;
end $$;

-- The parent of a step write: this account's live, unfinished task. Locks it (shared), so
-- a completion or removal of the parent and a step write are ordered, not interleaved.
-- A content-backed task without a progress row is Not started; that its published
-- document exists is checked by the action service before a new step is added.
-- Returns the parent's current state.
create function public.companion_step_parent(p_user uuid, p_ref text) returns text
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_us public.user_tasks%rowtype;
  v_ct public.custom_checklist_tasks%rowtype;
begin
  if p_ref is null or not public.companion_task_ref_valid(p_ref) then
    perform public.companion_fail('CA422', 'invalid_task_ref');
  end if;
  if split_part(p_ref, ':', 1) = 'sanity' then
    select * into v_us from public.user_tasks
     where user_id = p_user and sanity_checklist_id = substr(p_ref, 8) for share;
    if not found then return 'not_started'; end if;
    if v_us.dismissed_at is not null then
      perform public.companion_fail('CA422', 'task_removed', jsonb_build_object('task_ref', p_ref));
    end if;
    if v_us.completed is true then
      perform public.companion_fail('CA422', 'task_completed', jsonb_build_object('task_ref', p_ref));
    end if;
    return public.companion_task_state(v_us.completed, v_us.progress_state);
  end if;
  select * into v_ct from public.custom_checklist_tasks
   where user_id = p_user and id = substr(p_ref, 8)::bigint for share;
  if not found then
    perform public.companion_fail('CA404', 'task_not_found', jsonb_build_object('task_ref', p_ref));
  end if;
  if v_ct.removed_at is not null then
    perform public.companion_fail('CA422', 'task_removed', jsonb_build_object('task_ref', p_ref));
  end if;
  if v_ct.completed is true then
    perform public.companion_fail('CA422', 'task_completed', jsonb_build_object('task_ref', p_ref));
  end if;
  return public.companion_task_state(v_ct.completed, v_ct.progress_state);
end $$;

-- One step of this account, locked. Raises step_not_found for any other account's step.
create function public.companion_step_row(p_user uuid, p_step jsonb) returns public.companion_task_steps
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row public.companion_task_steps%rowtype;
begin
  select * into v_row from public.companion_task_steps
   where id = (p_step #>> '{}')::uuid and user_id = p_user for update;
  if not found then
    perform public.companion_fail('CA404', 'step_not_found');
  end if;
  return v_row;
end $$;

create function public.companion_step_conflict(p_row public.companion_task_steps, p_expected bigint) returns void
language plpgsql as $$
begin
  if p_row.revision <> p_expected then
    perform public.companion_fail('CA409', 'revision_conflict',
      jsonb_build_object('step_id', p_row.id, 'task_ref', p_row.task_ref, 'expected', p_expected, 'actual', p_row.revision));
  end if;
end $$;

-- Executes one step operation. The result records what was saved, with each step's
-- title at that moment (a receipt stays historical after a rename), the parent's
-- unchanged state, and the exact inverse.
create function public.companion_apply_step(p_user uuid, p_op jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_type text := p_op->>'type';
  v_ref text;
  v_parent text;
  v_row public.companion_task_steps%rowtype;
  v_pos integer;
  v_title jsonb;
  v_steps jsonb := '[]'::jsonb;
  v_inv jsonb := '[]'::jsonb;
  v_item jsonb;
  v_expected bigint := public.companion_nonneg_int(p_op->'expected_revision', 15);
begin
  if v_type = 'step.create' then
    v_ref := p_op->>'task_ref';
    v_parent := public.companion_step_parent(p_user, v_ref);
    -- One writer per parent orders the positions of concurrent additions.
    perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':' || v_ref, 366));
    if (select count(*) from public.companion_task_steps
         where user_id = p_user and task_ref = v_ref and removed_at is null)
       + jsonb_array_length(p_op->'titles') > 50 then
      perform public.companion_fail('CA422', 'too_many_steps', jsonb_build_object('task_ref', v_ref));
    end if;
    select coalesce(max(position), -1) into v_pos from public.companion_task_steps
     where user_id = p_user and task_ref = v_ref;
    for v_title in select * from jsonb_array_elements(p_op->'titles') loop
      v_pos := v_pos + 1;
      insert into public.companion_task_steps (user_id, task_ref, title, position)
      values (p_user, v_ref, v_title #>> '{}', v_pos) returning * into v_row;
      v_steps := v_steps || jsonb_build_array(jsonb_build_object(
        'step_id', v_row.id, 'title', v_row.title, 'before_done', false, 'done', false,
        'before_revision', 0, 'after_revision', v_row.revision));
      v_inv := v_inv || jsonb_build_array(jsonb_build_object('step_id', v_row.id, 'expected_revision', v_row.revision));
    end loop;
    return jsonb_build_object('type', v_type, 'task_ref', v_ref, 'before_state', v_parent, 'state', v_parent,
      'before_revision', 0, 'after_revision', 1, 'steps', v_steps,
      'inverse', jsonb_build_object('type', 'step.remove_created', 'task_ref', v_ref, 'steps', v_inv));
  end if;

  if v_type = 'step.remove_created' then
    v_ref := p_op->>'task_ref';
    -- Lock in a stable order; check every step before changing any.
    for v_item in select e from jsonb_array_elements(p_op->'steps') e order by e->>'step_id' loop
      v_row := public.companion_step_row(p_user, v_item->'step_id');
      if v_row.task_ref <> v_ref then
        perform public.companion_fail('CA422', 'invalid_steps');
      end if;
    end loop;
    v_parent := public.companion_step_parent(p_user, v_ref);
    for v_item in select e from jsonb_array_elements(p_op->'steps') e loop
      select * into v_row from public.companion_task_steps where id = (v_item->>'step_id')::uuid;
      if v_row.removed_at is not null then
        perform public.companion_fail('CA422', 'step_removed', jsonb_build_object('step_id', v_row.id));
      end if;
      perform public.companion_step_conflict(v_row, (v_item->>'expected_revision')::bigint);
      update public.companion_task_steps set removed_at = now(), revision = revision + 1
       where id = v_row.id returning * into v_row;
      v_steps := v_steps || jsonb_build_array(jsonb_build_object(
        'step_id', v_row.id, 'title', v_row.title, 'before_done', v_row.completed, 'done', v_row.completed,
        'before_revision', v_row.revision - 1, 'after_revision', v_row.revision, 'removed', true));
    end loop;
    return jsonb_build_object('type', v_type, 'task_ref', v_ref, 'before_state', v_parent, 'state', v_parent,
      'before_revision', 0, 'after_revision', 0, 'steps', v_steps);
  end if;

  -- One existing step: update, set_done, remove, restore.
  v_row := public.companion_step_row(p_user, p_op->'step_id');
  v_ref := v_row.task_ref;
  v_parent := public.companion_step_parent(p_user, v_ref);
  if v_type = 'step.restore' then
    if v_row.removed_at is null then
      perform public.companion_fail('CA422', 'step_not_removed', jsonb_build_object('step_id', v_row.id));
    end if;
  elsif v_row.removed_at is not null then
    perform public.companion_fail('CA422', 'step_removed', jsonb_build_object('step_id', v_row.id));
  end if;
  perform public.companion_step_conflict(v_row, v_expected);

  if v_type = 'step.update' then
    update public.companion_task_steps set title = p_op->>'title', revision = revision + 1
     where id = v_row.id;
  elsif v_type = 'step.set_done' then
    update public.companion_task_steps set completed = (p_op->>'done')::boolean, revision = revision + 1
     where id = v_row.id;
  elsif v_type = 'step.remove' then
    update public.companion_task_steps set removed_at = now(), revision = revision + 1 where id = v_row.id;
  else
    update public.companion_task_steps set removed_at = null, revision = revision + 1 where id = v_row.id;
  end if;
  v_item := (select to_jsonb(s) from public.companion_task_steps s where s.id = v_row.id);

  return jsonb_build_object('type', v_type, 'task_ref', v_ref, 'before_state', v_parent, 'state', v_parent,
    'before_revision', v_row.revision, 'after_revision', (v_item->>'revision')::bigint,
    'steps', jsonb_build_array(jsonb_build_object(
      'step_id', v_row.id, 'before_title', v_row.title, 'title', v_item->>'title',
      'before_done', v_row.completed, 'done', (v_item->>'completed')::boolean,
      'before_revision', v_row.revision, 'after_revision', (v_item->>'revision')::bigint)
      || case when v_type = 'step.remove' then jsonb_build_object('removed', true) else '{}'::jsonb end),
    'inverse', case v_type
      when 'step.update' then jsonb_build_object('type', 'step.update', 'step_id', v_row.id, 'title', v_row.title,
                                                 'expected_revision', (v_item->>'revision')::bigint)
      when 'step.set_done' then jsonb_build_object('type', 'step.set_done', 'step_id', v_row.id, 'done', v_row.completed,
                                                   'expected_revision', (v_item->>'revision')::bigint)
      when 'step.remove' then jsonb_build_object('type', 'step.restore', 'step_id', v_row.id,
                                                 'expected_revision', (v_item->>'revision')::bigint)
      else jsonb_build_object('type', 'step.remove', 'step_id', v_row.id,
                              'expected_revision', (v_item->>'revision')::bigint) end);
end $$;

-- Every step a receipt names is still at the revision the receipt produced.
create function public.companion_steps_current(p_user uuid, p_steps jsonb) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_typeof(p_steps) = 'array' and jsonb_array_length(p_steps) > 0, false)
     and not exists (
    select 1 from jsonb_array_elements(p_steps) e
      left join public.companion_task_steps s on s.user_id = p_user and s.id = (e->>'step_id')::uuid
     where s.id is null or s.revision <> (e->>'after_revision')::bigint)
$$;

-- Undo of a receipt of a step operation. Applies its recorded inverse when every step is
-- still at the revision the receipt produced; otherwise nothing changes and a reviewed
-- compensating change at the current revisions is returned. Removing a step (the Undo
-- of an added step) needs removal_confirmed.
create function public.companion_undo_step(
  p_user uuid, p_operation_id uuid, p_hash text, p_contract_version integer, p_authorization jsonb,
  p_target public.companion_action_receipts
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_inv jsonb := p_target.inverse->0;
  v_type text := p_target.inverse->0->>'type';
  v_removes boolean := (p_target.inverse->0->>'type') in ('step.remove', 'step.remove_created');
  v_conflict boolean := false;
  v_row public.companion_task_steps%rowtype;
  v_item jsonb;
  v_ops jsonb;
  v_live jsonb := '[]'::jsonb;
  v_prop public.companion_proposals%rowtype;
begin
  if v_removes and (jsonb_typeof(p_authorization->'removal_confirmed') is distinct from 'boolean'
                    or (p_authorization->>'removal_confirmed')::boolean is not true) then
    perform public.companion_fail('CA403', 'removal_requires_confirmation');
  end if;
  if exists (select 1 from public.companion_action_receipts
              where user_id = p_user and undo_of = p_target.operation_id) then
    perform public.companion_fail('CA411', 'already_undone', jsonb_build_object('receipt_operation_id', p_target.operation_id));
  end if;

  if v_type = 'step.remove_created' then
    for v_item in select e from jsonb_array_elements(v_inv->'steps') e order by e->>'step_id' loop
      v_row := public.companion_step_row(p_user, v_item->'step_id');
      if v_row.removed_at is null then
        v_live := v_live || jsonb_build_array(jsonb_build_object('step_id', v_row.id, 'expected_revision', v_row.revision));
        if v_row.revision <> (v_item->>'expected_revision')::bigint then v_conflict := true; end if;
      else
        v_conflict := true;
      end if;
    end loop;
    v_ops := jsonb_build_array(jsonb_build_object('type', 'step.remove_created', 'task_ref', v_inv->>'task_ref',
                                                  'steps', v_live));
  else
    v_row := public.companion_step_row(p_user, v_inv->'step_id');
    if v_row.revision <> (v_inv->>'expected_revision')::bigint then v_conflict := true; end if;
    v_ops := jsonb_build_array(v_inv || jsonb_build_object('expected_revision', v_row.revision));
  end if;
  perform public.companion_step_parent(p_user, coalesce(v_inv->>'task_ref', v_row.task_ref));

  -- A concurrent Undo of the same receipt may have committed while this one waited.
  if exists (select 1 from public.companion_action_receipts
              where user_id = p_user and undo_of = p_target.operation_id) then
    perform public.companion_fail('CA411', 'already_undone', jsonb_build_object('receipt_operation_id', p_target.operation_id));
  end if;

  if v_conflict then
    if v_type = 'step.remove_created' and jsonb_array_length(v_live) = 0 then
      perform public.companion_fail('CA422', 'step_removed');
    end if;
    if v_type <> 'step.remove_created' and v_type <> 'step.restore' and v_row.removed_at is not null then
      perform public.companion_fail('CA422', 'step_removed', jsonb_build_object('step_id', v_row.id));
    end if;
    select * into v_prop from public.companion_proposals
     where user_id = p_user and undo_of = p_target.operation_id and status = 'draft'
       and operations_hash = public.companion_ops_hash(v_ops)
     order by created_at desc limit 1;
    if not found then
      insert into public.companion_proposals (user_id, operations, operations_hash, undo_of, kind, updated_at)
      values (p_user, v_ops, public.companion_ops_hash(v_ops), p_target.operation_id, 'compensation', now())
      returning * into v_prop;
    end if;
    return jsonb_build_object('conflict', true, 'receipt_operation_id', p_target.operation_id,
      'current', '[]'::jsonb,
      'proposal', jsonb_build_object('proposal_id', v_prop.id, 'proposal_revision', v_prop.revision,
                                     'operations', v_prop.operations));
  end if;

  return public.companion_record(p_user, p_operation_id, p_hash, p_contract_version,
    jsonb_build_object('kind', 'ui_control', 'undo_of', p_target.operation_id)
      || case when v_removes then jsonb_build_object('removal_confirmed', true) else '{}'::jsonb end,
    jsonb_build_array(public.companion_apply_step(p_user, v_ops->0)), p_target.operation_id);
end $$;

-- Live steps of this account, in order. Steps of a custom task that no longer exists
-- (deleted by a released client) are not read.
create function public.companion_read_steps(p_user_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'step_id', s.id, 'task_ref', s.task_ref, 'title', s.title, 'done', s.completed,
           'position', s.position, 'revision', s.revision)
         order by s.task_ref, s.position, s.created_at), '[]'::jsonb)
    from public.companion_task_steps s
   where s.user_id = p_user_id and s.removed_at is null
     and (s.task_ref not like 'custom:%' or exists (
           select 1 from public.custom_checklist_tasks c
            where c.user_id = s.user_id and c.id = substr(s.task_ref, 8)::bigint))
$$;

-- The relevant context of a step proposal: the parent's live steps that have one of the
-- proposed titles (shown in review, never merged). Other steps are unrelated.
create function public.companion_step_context(p_user uuid, p_ops jsonb) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('task_ref', p_ops->0->>'task_ref',
    'existing_steps', coalesce((
      select jsonb_agg(jsonb_build_object('step_id', s.id, 'title', s.title) order by s.position, s.created_at)
        from public.companion_task_steps s
       where s.user_id = p_user and s.task_ref = p_ops->0->>'task_ref' and s.removed_at is null
         and public.companion_title_key(s.title) in (
               select public.companion_title_key(t #>> '{}') from jsonb_array_elements(p_ops->0->'titles') t)),
      '[]'::jsonb))
$$;

-- ------------------------------------------------ shared action functions (#361/#363)
-- Each keeps its accepted body verbatim and adds only the marked #366 lines.

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
    if v_type is null or v_type not in ('task.set_state', 'task.create_custom', 'task.remove_created') then
      perform public.companion_fail('CA422', 'unsupported_operation', jsonb_build_object('type', v_type));
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
  v_rev bigint;
  v_msg bigint;
  v_prop uuid;
  v_undo_of uuid;
begin
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
    if v_creates then
      perform public.companion_fail('CA403', 'invalid_authorization');
    end if;
    return null;
  elsif v_kind = 'direct_command' then
    v_msg := public.companion_nonneg_int(p_auth->'message_id', 9);
    if v_msg is null or not v_creates
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
    if jsonb_array_length(public.companion_same_title_tasks(p_user, p_ops->0->>'title')) > 0 then
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
begin
  -- #366: a step operation is executed by the step domain.
  if p_op->>'type' like 'step.%' then
    return public.companion_apply_step(p_user, p_op);
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

create or replace function public.companion_read_tasks(p_user_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(t order by t->>'task_ref'), '[]'::jsonb) from (
    select jsonb_build_object(
      'task_ref', 'sanity:' || u.sanity_checklist_id, 'source', 'sanity',
      'state', public.companion_task_state(u.completed, u.progress_state),
      'waiting_reason', u.waiting_reason, 'revision', u.revision, 'removed', u.dismissed_at is not null,
      'state_updated_at', u.state_updated_at,
      'last_receipt', (select public.companion_receipt_summary(r) from public.companion_action_receipts r
                        where r.user_id = u.user_id and r.task_ref = 'sanity:' || u.sanity_checklist_id
                          and coalesce(r.outcome->'results'->0->>'type', 'task.set_state') not like 'step.%'
                        order by r.created_at desc limit 1)
    ) t
    from public.user_tasks u where u.user_id = p_user_id and u.sanity_checklist_id is not null
    union all
    select jsonb_build_object(
      'task_ref', 'custom:' || c.id, 'source', 'custom', 'title', c.title,
      'state', public.companion_task_state(c.completed, c.progress_state),
      'waiting_reason', c.waiting_reason, 'revision', c.revision, 'removed', c.removed_at is not null,
      'state_updated_at', c.state_updated_at,
      'last_receipt', (select public.companion_receipt_summary(r) from public.companion_action_receipts r
                        where r.user_id = c.user_id and r.task_ref = 'custom:' || c.id
                          and coalesce(r.outcome->'results'->0->>'type', 'task.set_state') not like 'step.%'
                        order by r.created_at desc limit 1)
    )
    from public.custom_checklist_tasks c where c.user_id = p_user_id
  ) s(t)
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
      if v_inv->>'type' = 'task.remove_created' and v_ct.removed_at is not null then
        perform public.companion_fail('CA422', 'task_removed', jsonb_build_object('task_ref', v_ref));
      end if;
      v_rev := v_ct.revision;
      v_current := v_current || jsonb_build_array(jsonb_build_object('task_ref', v_ref, 'revision', v_rev,
        'state', public.companion_task_state(v_ct.completed, v_ct.progress_state),
        'waiting_reason', v_ct.waiting_reason, 'removed', v_ct.removed_at is not null));
    end if;
    if v_rev <> (v_inv->>'expected_revision')::bigint then
      v_conflict := true;
    end if;
    if v_inv->>'type' = 'task.remove_created' then
      v_ops := v_ops || jsonb_build_array(jsonb_build_object(
        'type', 'task.remove_created', 'task_ref', v_ref, 'expected_revision', v_rev));
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
  if p_operations->0->>'type' not in ('task.create_custom', 'step.create') then
    perform public.companion_fail('CA422', 'unsupported_operation', jsonb_build_object('type', p_operations->0->>'type'));
  end if;
  -- #366: suggested steps need a live, unfinished task of this account.
  if p_operations->0->>'type' = 'step.create' then
    perform public.companion_step_parent(p_user_id, p_operations->0->>'task_ref');
  end if;
  insert into public.companion_proposals (user_id, operations, operations_hash, kind, context, source, updated_at)
  values (p_user_id, p_operations, public.companion_ops_hash(p_operations),
          case when p_operations->0->>'type' = 'step.create' then 'step_create' else 'task_create' end,
          public.companion_proposal_context(p_user_id, p_operations),
          public.companion_check_source(p_user_id, p_source), now())
  returning * into v_prop;
  return public.companion_proposal_view(v_prop);
end $$;

create or replace function public.companion_revise_proposal(
  p_user_id uuid, p_proposal_id uuid, p_proposal_revision integer, p_operations jsonb
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prop public.companion_proposals%rowtype;
begin
  perform public.companion_validate_operations(p_operations);
  select * into v_prop from public.companion_proposals
   where id = p_proposal_id and user_id = p_user_id for update;
  if not found then
    perform public.companion_fail('CA404', 'proposal_not_found');
  end if;
  if not ((v_prop.kind = 'task_create' and p_operations->0->>'type' = 'task.create_custom')
          or (v_prop.kind = 'step_create' and p_operations->0->>'type' = 'step.create')) then
    perform public.companion_fail('CA422', 'unsupported_operation');
  end if;
  -- #366: an edit keeps suggested steps under the task they were suggested for.
  if v_prop.kind = 'step_create' and p_operations->0->>'task_ref' is distinct from v_prop.operations->0->>'task_ref' then
    perform public.companion_fail('CA422', 'invalid_task_ref');
  end if;
  if v_prop.status <> 'draft' or v_prop.revision <> p_proposal_revision then
    return jsonb_build_object('changed', true, 'proposal', public.companion_proposal_view(v_prop));
  end if;
  update public.companion_proposals
     set operations = p_operations, operations_hash = public.companion_ops_hash(p_operations),
         revision = revision + 1, context = public.companion_proposal_context(p_user_id, p_operations),
         previous_context = null, review_reason = 'edited', updated_at = now()
   where id = v_prop.id
  returning * into v_prop;
  return jsonb_build_object('proposal', public.companion_proposal_view(v_prop));
end $$;

create or replace function public.companion_cancel_proposal(p_user_id uuid, p_proposal_id uuid, p_proposal_revision integer) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prop public.companion_proposals%rowtype;
begin
  select * into v_prop from public.companion_proposals
   where id = p_proposal_id and user_id = p_user_id and kind in ('task_create', 'step_create') for update;
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
  if not found or coalesce(v_prop.kind, '') not in ('task_create', 'step_create') or v_prop.status <> 'draft'
     or v_prop.revision is distinct from public.companion_nonneg_int(p_auth->'proposal_revision', 9)
     or v_prop.operations_hash <> public.companion_ops_hash(p_ops) then
    return null;
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
                   where p.user_id = p_user_id and p.kind in ('task_create', 'step_create')
                     and p.source->>'conversation_id' = p_conversation_id::text),
    'commands', (select coalesce(jsonb_agg(jsonb_build_object(
                          'message_id', u.message_id, 'operation_id', u.operation_id,
                          'receipt', public.companion_receipt_summary(r)) order by u.created_at), '[]'::jsonb)
                   from public.companion_command_uses u
                   join public.messages m on m.id = u.message_id and m.conversation_id = v_conv
                   join public.companion_action_receipts r on r.user_id = u.user_id and r.operation_id = u.operation_id
                  where u.user_id = p_user_id));
end $$;

-- The relevant context of a draft, by kind: a new task (#363) or suggested steps (#366).
create function public.companion_proposal_context(p_user uuid, p_ops jsonb) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when p_ops->0->>'type' = 'step.create' then public.companion_step_context(p_user, p_ops)
              else public.companion_create_context(p_user, p_ops) end
$$;

-- ------------------------------------------------------------------ grants
revoke all on function
  public.companion_step_title_ok(jsonb), public.companion_uuid_ok(jsonb), public.companion_step_validate(jsonb),
  public.companion_step_parent(uuid, text), public.companion_step_row(uuid, jsonb),
  public.companion_step_conflict(public.companion_task_steps, bigint), public.companion_apply_step(uuid, jsonb),
  public.companion_steps_current(uuid, jsonb),
  public.companion_undo_step(uuid, uuid, text, integer, jsonb, public.companion_action_receipts),
  public.companion_read_steps(uuid), public.companion_step_context(uuid, jsonb),
  public.companion_proposal_context(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.companion_read_steps(uuid) to service_role;
