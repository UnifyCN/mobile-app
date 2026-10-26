-- Companion task creation: a reviewed proposal or a clear direct command adds one
-- custom Checklist task, with a receipt and revision-checked Undo (mobile-app#363).
-- Builds on 20261025235536_companion_task_actions.sql (#361) and keeps its rules:
-- legacy columns stay authoritative, only the action service writes, a full schema
-- rollback stops pending reminders and a re-application restarts none.
--
-- Authority: this repo owns the migration. The web repo mirrors this file byte for
-- byte with the same timestamp. Rollback script (mirrored too):
-- supabase/rollbacks/20261026165156_companion_task_create.down.sql. Run it before the
-- #361 rollback script. Apply through the normal release path with the gate off.
--
-- Additive: new nullable proposal columns, one new table, new functions, and new
-- versions of the #361 action functions with the same signatures.

-- ------------------------------------------------------------------ proposals
alter table public.companion_proposals
  add column kind text check (kind is null or kind in ('compensation', 'task_create')),
  -- Relevant context the reviewed draft was prepared against: the profile fields
  -- shown in review and the live tasks with the same title (task_ref + revision).
  add column context jsonb,
  -- Where the draft came from: { conversation_id, message_id } of the caller's own
  -- conversation. Display and lookup only; never authorization.
  add column source jsonb,
  -- Why the current revision needs review: 'edited' or 'context_changed'. Null for
  -- a first draft.
  add column review_reason text check (review_reason is null or review_reason in ('edited', 'context_changed')),
  -- With review_reason 'context_changed': the context the earlier revision was reviewed
  -- against, so review can show the old and the current values.
  add column previous_context jsonb,
  add column receipt_operation_id uuid,
  add column updated_at timestamptz;
create index companion_proposals_source_idx
  on public.companion_proposals (user_id, (source->>'conversation_id')) where source is not null;

-- ------------------------------------------------------------ shared helpers
-- The title as it is compared for "a task with this title already exists".
create function public.companion_title_key(p_title text) returns text
language sql immutable as $$
  select lower(regexp_replace(btrim(coalesce(p_title, '')), '\s+', ' ', 'g'))
$$;

-- Profile fields a task proposal shows and depends on, read from the authoritative
-- row. Other profile fields (persona, stage, reminder preference) are not relevant.
create function public.companion_profile_context(p_user uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when r.j is null then null
              else jsonb_build_object('city', r.j->'city', 'province', r.j->'province',
                                      'arrival_date', r.j->'arrival_date') end
    from (select (select to_jsonb(p) from public.user_onboarding_profiles p where p.id = p_user) as j) r
$$;

-- Live custom tasks of the caller with the same title, with their revisions.
create function public.companion_same_title_tasks(p_user uuid, p_title text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('task_ref', 'custom:' || c.id, 'revision', c.revision,
                                               'title', c.title) order by c.id), '[]'::jsonb)
    from public.custom_checklist_tasks c
   where c.user_id = p_user and c.removed_at is null
     and public.companion_title_key(c.title) = public.companion_title_key(p_title)
$$;

-- The relevant context of a task-creation proposal, read now.
create function public.companion_create_context(p_user uuid, p_ops jsonb) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('profile', public.companion_profile_context(p_user),
                            'same_title_tasks', public.companion_same_title_tasks(p_user, p_ops->0->>'title'))
$$;

-- The one canonical spelling of a create operation.
create function public.companion_create_op(p_title text, p_priority text) returns jsonb
language sql immutable as $$
  select jsonb_build_object('type', 'task.create_custom', 'title', btrim(p_title), 'priority', p_priority)
$$;

-- ------------------------------------------------------------ registry check
-- Implemented operation types: task.set_state (#361) and task.create_custom (#363).
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
    if v_type is null or v_type not in ('task.set_state', 'task.create_custom') then
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
begin
  if p_op->>'type' = 'task.create_custom' then
    insert into public.custom_checklist_tasks (user_id, priority, title, description)
    values (p_user, p_op->>'priority', p_op->>'title', '')
    returning id, revision into v_id, v_after;
    -- No title in the result: a receipt holds identifiers, states and revisions only.
    return jsonb_build_object(
      'type', 'task.create_custom', 'task_ref', 'custom:' || v_id,
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
-- Public summary of a receipt. Adds the operation type and, for a created task, its
-- current title (read from the task, never stored on the receipt).
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
         jsonb_build_object('title', (select c.title from public.custom_checklist_tasks c
                                       where c.user_id = p_receipt.user_id
                                         and 'custom:' || c.id = p_receipt.task_ref))
       else '{}'::jsonb end
  from (select p_receipt.outcome->'results'->0 as r) x
  left join public.companion_action_receipts u
    on u.user_id = p_receipt.user_id and u.undo_of = p_receipt.operation_id
$$;

-- ----------------------------------------------------------------- proposals
create function public.companion_proposal_view(p_prop public.companion_proposals) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'proposal_id', p_prop.id, 'proposal_revision', p_prop.revision,
    'status', p_prop.status, 'kind', coalesce(p_prop.kind, 'compensation'),
    'operations', p_prop.operations, 'context', p_prop.context, 'source', p_prop.source,
    'review_reason', p_prop.review_reason, 'previous_context', p_prop.previous_context,
    'created_at', p_prop.created_at,
    'receipt', (select public.companion_receipt_summary(r) from public.companion_action_receipts r
                 where r.user_id = p_prop.user_id and r.operation_id = p_prop.receipt_operation_id))
$$;

-- The caller's own conversation and, optionally, a message in it.
create function public.companion_check_source(p_user uuid, p_source jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_conv uuid; v_msg bigint;
begin
  if p_source is null or jsonb_typeof(p_source) = 'null' then return null; end if;
  if jsonb_typeof(p_source) <> 'object' or jsonb_typeof(p_source->'conversation_id') is distinct from 'string'
     or (p_source->>'conversation_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or exists (select 1 from jsonb_object_keys(p_source) k where k not in ('conversation_id', 'message_id')) then
    perform public.companion_fail('CA422', 'invalid_source');
  end if;
  v_conv := (p_source->>'conversation_id')::uuid;
  if not exists (select 1 from public.conversations c where c.conversation_identifier = v_conv and c.user_id = p_user) then
    perform public.companion_fail('CA404', 'conversation_not_found');
  end if;
  if p_source ? 'message_id' then
    v_msg := public.companion_nonneg_int(p_source->'message_id', 9);
    if v_msg is null or not exists (
      select 1 from public.messages m join public.conversations c on c.id = m.conversation_id
       where m.id = v_msg::int and c.conversation_identifier = v_conv and c.user_id = p_user) then
      perform public.companion_fail('CA404', 'message_not_found');
    end if;
    return jsonb_build_object('conversation_id', v_conv, 'message_id', v_msg);
  end if;
  return jsonb_build_object('conversation_id', v_conv);
end $$;

-- Prepare: a reviewable draft. Writes only the proposal row, never task progress.
create function public.companion_prepare_proposal(p_user_id uuid, p_operations jsonb, p_source jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_prop public.companion_proposals%rowtype;
begin
  perform public.companion_validate_operations(p_operations);
  if p_operations->0->>'type' <> 'task.create_custom' then
    perform public.companion_fail('CA422', 'unsupported_operation', jsonb_build_object('type', p_operations->0->>'type'));
  end if;
  insert into public.companion_proposals (user_id, operations, operations_hash, kind, context, source, updated_at)
  values (p_user_id, p_operations, public.companion_ops_hash(p_operations), 'task_create',
          public.companion_create_context(p_user_id, p_operations),
          public.companion_check_source(p_user_id, p_source), now())
  returning * into v_prop;
  return public.companion_proposal_view(v_prop);
end $$;

create function public.companion_get_proposal(p_user_id uuid, p_proposal_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_prop public.companion_proposals%rowtype;
begin
  select * into v_prop from public.companion_proposals where id = p_proposal_id and user_id = p_user_id;
  if not found then
    perform public.companion_fail('CA404', 'proposal_not_found');
  end if;
  return public.companion_proposal_view(v_prop);
end $$;

-- Edit a draft: a new revision that needs its own approval. A request naming an older
-- revision, or a proposal that is no longer a draft, changes nothing and returns the
-- current proposal ({ changed: true, proposal }).
create function public.companion_revise_proposal(
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
  if v_prop.kind is distinct from 'task_create' or p_operations->0->>'type' <> 'task.create_custom' then
    perform public.companion_fail('CA422', 'unsupported_operation');
  end if;
  if v_prop.status <> 'draft' or v_prop.revision <> p_proposal_revision then
    return jsonb_build_object('changed', true, 'proposal', public.companion_proposal_view(v_prop));
  end if;
  update public.companion_proposals
     set operations = p_operations, operations_hash = public.companion_ops_hash(p_operations),
         revision = revision + 1, context = public.companion_create_context(p_user_id, p_operations),
         previous_context = null, review_reason = 'edited', updated_at = now()
   where id = v_prop.id
  returning * into v_prop;
  return jsonb_build_object('proposal', public.companion_proposal_view(v_prop));
end $$;

-- Before an approved task-creation proposal is used, read its relevant context again.
-- When it changed, the approval is not used: the proposal moves to a new revision with
-- the current context for a new review. Returns that proposal, or null to go on.
create function public.companion_recheck_proposal(p_user uuid, p_ops jsonb, p_auth jsonb) returns jsonb
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
  if not found or v_prop.kind is distinct from 'task_create' or v_prop.status <> 'draft'
     or v_prop.revision is distinct from public.companion_nonneg_int(p_auth->'proposal_revision', 9)
     or v_prop.operations_hash <> public.companion_ops_hash(p_ops) then
    return null;
  end if;
  v_now := public.companion_create_context(p_user, p_ops);
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
  v_undo_of := public.companion_check_authorization(p_user_id, p_operations, p_authorization);
  -- Any failure below raises and rolls back every operation, the consumed approval and the receipt.
  for v_op in select * from jsonb_array_elements(p_operations) loop
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

-- ------------------------------------------------------------------ grants
revoke all on function
  public.companion_title_key(text), public.companion_profile_context(uuid),
  public.companion_same_title_tasks(uuid, text), public.companion_create_context(uuid, jsonb),
  public.companion_create_op(text, text), public.companion_proposal_view(public.companion_proposals),
  public.companion_check_source(uuid, jsonb), public.companion_prepare_proposal(uuid, jsonb, jsonb),
  public.companion_get_proposal(uuid, uuid), public.companion_revise_proposal(uuid, uuid, integer, jsonb),
  public.companion_recheck_proposal(uuid, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function
  public.companion_prepare_proposal(uuid, jsonb, jsonb), public.companion_get_proposal(uuid, uuid),
  public.companion_revise_proposal(uuid, uuid, integer, jsonb)
  to service_role;
