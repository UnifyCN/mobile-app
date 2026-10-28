-- Companion saved personal details: details the user approved for Companion to use in
-- later conversations, with the common revision, receipt, lookup and Undo rules
-- (mobile-app#370). Builds on 20261025235536_companion_task_actions.sql (#361),
-- 20261026165156_companion_task_create.sql (#363) and
-- 20261027183644_companion_task_steps.sql (#366).
--
-- Authority: this repo owns the migration. The web repo mirrors this file byte for byte
-- with the same timestamp. Rollback script (mirrored too):
-- supabase/rollbacks/20261028004902_companion_saved_details.down.sql. Run it before the
-- #366 rollback. Apply through the normal release path with the gate off.
--
-- Rules:
--   * A detail is saved only by the user's own clear "remember" message (direct_command,
--     resolved by the action service from the saved message) or by approving a reviewed
--     draft (approved_proposal). Reading a conversation never saves anything; a direct
--     control (ui_control) can edit or remove a detail, never add one.
--   * Each detail has an owner (the account), a scope ('companion': later Companion
--     conversations), provenance (how it was authorized and in which conversation) and a
--     revision. Edits and removals name the revision the user saw.
--   * Every removal needs explicit confirmation, also the Undo of a save.
--   * The profile owns province, city, arrival date and immigration status. The action
--     service refuses those as details before any write (profile facts are not text
--     the database can classify).
--   * Later answers read live details with the user's own JWT (RLS below); rag-query reads
--     them only while the feature gate is on. A removed detail is never read again.
--   * Receipts keep the text each change saved; a later edit makes them historical.
--
-- Additive: one new table, new functions, a widened proposal kind, and new versions of
-- the shared action functions that keep each accepted #366 body and add marked lines.

alter table public.companion_proposals drop constraint companion_proposals_kind_check;
alter table public.companion_proposals add constraint companion_proposals_kind_check
  check (kind is null or kind in ('compensation', 'task_create', 'step_create', 'detail_create'));

-- ------------------------------------------------------------------ details
create table public.companion_saved_details (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Where the detail is used: later Companion conversations of this account.
  scope text not null default 'companion' check (scope = 'companion'),
  -- One line of plain text, exactly as reviewed.
  body text not null check (char_length(body) between 1 and 300 and body = btrim(body) and body !~ '[[:cntrl:]]'),
  -- How it was authorized: { kind: direct_command | approved_proposal, conversation_id,
  -- message_id?, proposal_id? }. Identifiers only.
  source jsonb not null,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Removed details are kept for Undo and receipts, and never read as context.
  removed_at timestamptz
);
create index companion_saved_details_user_idx on public.companion_saved_details (user_id, created_at)
  where removed_at is null;
alter table public.companion_saved_details enable row level security;

-- Owners read their own live details (rag-query reads them with the user's JWT, and
-- only while the feature gate is on). Writes go through the action service only.
create policy companion_saved_details_select_own on public.companion_saved_details
  for select to authenticated
  using ((select auth.uid()) = user_id and removed_at is null);
revoke all on public.companion_saved_details from anon, authenticated;
-- New public tables are not exposed to the Data API by default: grant the read explicitly.
grant select on public.companion_saved_details to authenticated;

-- ------------------------------------------ recovery after a rollback (down script)
-- The rollback script archives details, detail receipts and detail drafts to
-- companion_rollback_archive_370. Re-applying puts them back. A restored draft moves to a
-- new revision that needs review. Rows of deleted accounts are not restored.
do $recover370$
begin
  if to_regclass('public.companion_rollback_archive_370') is null then
    return;
  end if;
  insert into public.companion_saved_details
    select (jsonb_populate_record(null::public.companion_saved_details, a.row_data)).*
      from public.companion_rollback_archive_370 a
     where a.source = 'companion_saved_details' and a.restored_at is null
       and exists (select 1 from auth.users u where u.id = (a.row_data->>'user_id')::uuid)
     order by a.id
    on conflict do nothing;
  insert into public.companion_action_receipts
    select (jsonb_populate_record(null::public.companion_action_receipts, a.row_data)).*
      from public.companion_rollback_archive_370 a
     where a.source = 'companion_action_receipts' and a.restored_at is null
       and exists (select 1 from auth.users u where u.id = (a.row_data->>'user_id')::uuid)
     order by a.id
    on conflict do nothing;
  insert into public.companion_proposals
    select (jsonb_populate_record(null::public.companion_proposals,
              case when a.row_data->>'status' = 'draft'
                   then a.row_data || jsonb_build_object('revision', (a.row_data->>'revision')::int + 1,
                                                         'review_reason', 'restored', 'previous_context', null)
                   else a.row_data end)).*
      from public.companion_rollback_archive_370 a
     where a.source = 'companion_proposals' and a.restored_at is null
       and exists (select 1 from auth.users u where u.id = (a.row_data->>'user_id')::uuid)
     order by a.id
    on conflict do nothing;
  update public.companion_rollback_archive_370 set restored_at = now() where restored_at is null;
end $recover370$;

-- ------------------------------------------------------------ detail helpers
-- A plain, already trimmed, one-line text of 1-300 characters.
create function public.companion_detail_text_ok(p_val jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(p_val) = 'string' and (p_val #>> '{}') = btrim(p_val #>> '{}')
         and char_length(p_val #>> '{}') between 1 and 300 and (p_val #>> '{}') !~ '[[:cntrl:]]'
$$;

-- Registry check of one detail operation.
create function public.companion_detail_validate(p_op jsonb) returns void
language plpgsql as $$
declare
  v_type text := p_op->>'type';
  v_allowed text[];
  v_key text;
begin
  v_allowed := case v_type
    when 'detail.create' then array['type', 'text']
    when 'detail.update' then array['type', 'detail_id', 'text', 'expected_revision']
    when 'detail.remove' then array['type', 'detail_id', 'expected_revision']
    when 'detail.restore' then array['type', 'detail_id', 'expected_revision']
  end;
  if v_allowed is null then
    perform public.companion_fail('CA422', 'unsupported_operation', jsonb_build_object('type', v_type));
  end if;
  for v_key in select jsonb_object_keys(p_op) loop
    if not v_key = any(v_allowed) then
      perform public.companion_fail('CA422', 'unknown_field', jsonb_build_object('field', v_key));
    end if;
  end loop;
  for v_key in select unnest(v_allowed) loop
    if not p_op ? v_key then
      perform public.companion_fail('CA422', case v_key when 'expected_revision' then 'expected_revision_required'
                                                       when 'detail_id' then 'invalid_detail_id' else 'invalid_text' end);
    end if;
  end loop;
  if 'detail_id' = any(v_allowed) and not public.companion_uuid_ok(p_op->'detail_id') then
    perform public.companion_fail('CA422', 'invalid_detail_id');
  end if;
  if 'expected_revision' = any(v_allowed) and public.companion_nonneg_int(p_op->'expected_revision', 15) is null then
    perform public.companion_fail('CA422', 'expected_revision_required');
  end if;
  if 'text' = any(v_allowed) and not public.companion_detail_text_ok(p_op->'text') then
    perform public.companion_fail('CA422', 'invalid_text');
  end if;
end $$;

-- The details lock of one account. Every write that can make two live details say the
-- same thing takes it before it reads the live details (add, edit, restore, approval of a
-- draft before its context read), so "already saved" is read and written in one order.
-- Lock order: operation lock, proposal row, detail row, details lock.
create function public.companion_details_lock(p_user uuid) returns void
language sql set search_path = public, pg_temp as $$
  select pg_advisory_xact_lock(hashtextextended(p_user::text || ':details', 370))
$$;

-- Live details of the account with the same text (compared like task titles).
create function public.companion_same_text_details(p_user uuid, p_text text, p_except uuid default null) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object('detail_id', d.id, 'text', d.body) order by d.created_at), '[]'::jsonb)
    from public.companion_saved_details d
   where d.user_id = p_user and d.removed_at is null and d.id is distinct from p_except
     and public.companion_title_key(d.body) = public.companion_title_key(p_text)
$$;

-- One detail of this account, locked. Raises detail_not_found for any other account's.
create function public.companion_detail_row(p_user uuid, p_id jsonb) returns public.companion_saved_details
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_row public.companion_saved_details%rowtype;
begin
  select * into v_row from public.companion_saved_details
   where id = (p_id #>> '{}')::uuid and user_id = p_user for update;
  if not found then
    perform public.companion_fail('CA404', 'detail_not_found');
  end if;
  return v_row;
end $$;

-- Executes one detail operation. The result records the text it saved (a receipt stays
-- historical after a later edit), the detail's own revisions and the exact inverse.
create function public.companion_apply_detail(p_user uuid, p_op jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_type text := p_op->>'type';
  v_row public.companion_saved_details%rowtype;
  v_after public.companion_saved_details%rowtype;
begin
  if v_type = 'detail.create' then
    perform public.companion_details_lock(p_user);
    if jsonb_array_length(public.companion_same_text_details(p_user, p_op->>'text')) > 0 then
      perform public.companion_fail('CA414', 'detail_exists',
        jsonb_build_object('same_text_details', public.companion_same_text_details(p_user, p_op->>'text')));
    end if;
    if (select count(*) from public.companion_saved_details where user_id = p_user and removed_at is null) >= 50 then
      perform public.companion_fail('CA422', 'too_many_details');
    end if;
    insert into public.companion_saved_details (user_id, body, source)
    values (p_user, p_op->>'text',
            coalesce(nullif(current_setting('companion.detail_source', true), '')::jsonb, '{}'::jsonb))
    returning * into v_after;
    return jsonb_build_object('type', v_type, 'detail_id', v_after.id, 'text', v_after.body, 'before_text', null,
      'before_revision', 0, 'after_revision', v_after.revision,
      'inverse', jsonb_build_object('type', 'detail.remove', 'detail_id', v_after.id,
                                    'expected_revision', v_after.revision));
  end if;

  v_row := public.companion_detail_row(p_user, p_op->'detail_id');
  perform public.companion_details_lock(p_user);
  if v_type = 'detail.restore' then
    if v_row.removed_at is null then
      perform public.companion_fail('CA422', 'detail_not_removed', jsonb_build_object('detail_id', v_row.id));
    end if;
  elsif v_row.removed_at is not null then
    perform public.companion_fail('CA422', 'detail_removed', jsonb_build_object('detail_id', v_row.id));
  end if;
  if v_row.revision <> (p_op->>'expected_revision')::bigint then
    perform public.companion_fail('CA409', 'revision_conflict',
      jsonb_build_object('detail_id', v_row.id, 'expected', (p_op->>'expected_revision')::bigint, 'actual', v_row.revision));
  end if;
  if v_type in ('detail.update', 'detail.restore')
     and jsonb_array_length(public.companion_same_text_details(p_user, coalesce(p_op->>'text', v_row.body), v_row.id)) > 0 then
    perform public.companion_fail('CA414', 'detail_exists',
      jsonb_build_object('same_text_details', public.companion_same_text_details(p_user, coalesce(p_op->>'text', v_row.body), v_row.id)));
  end if;

  if v_type = 'detail.update' then
    update public.companion_saved_details set body = p_op->>'text', revision = revision + 1, updated_at = now()
     where id = v_row.id returning * into v_after;
  elsif v_type = 'detail.remove' then
    update public.companion_saved_details set removed_at = now(), revision = revision + 1, updated_at = now()
     where id = v_row.id returning * into v_after;
  else
    update public.companion_saved_details set removed_at = null, revision = revision + 1, updated_at = now()
     where id = v_row.id returning * into v_after;
  end if;

  return jsonb_build_object('type', v_type, 'detail_id', v_row.id, 'text', v_after.body,
    'before_text', case when v_type = 'detail.update' then v_row.body end,
    'before_revision', v_row.revision, 'after_revision', v_after.revision,
    'removed', v_after.removed_at is not null,
    'inverse', case v_type
      when 'detail.update' then jsonb_build_object('type', 'detail.update', 'detail_id', v_row.id, 'text', v_row.body,
                                                   'expected_revision', v_after.revision)
      when 'detail.remove' then jsonb_build_object('type', 'detail.restore', 'detail_id', v_row.id,
                                                   'expected_revision', v_after.revision)
      else jsonb_build_object('type', 'detail.remove', 'detail_id', v_row.id,
                              'expected_revision', v_after.revision) end);
end $$;

-- Authorization of a detail operation. Called by companion_check_authorization.
--   ui_control: edit, or removal with confirmation. Never a new detail or a restore.
--   direct_command: a new detail from the caller's own user message (the action service
--     checked the message says exactly this). One message authorizes one write.
--   approved_proposal: a new detail from its reviewed draft, or the reviewed change of a
--     conflicting Undo of a receipt of the same detail.
-- Records the provenance of a new detail for companion_apply_detail.
create function public.companion_detail_authorization(p_user uuid, p_ops jsonb, p_auth jsonb) returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_kind text := case when jsonb_typeof(p_auth) = 'object' and jsonb_typeof(p_auth->'kind') = 'string' then p_auth->>'kind' end;
  v_type text := p_ops->0->>'type';
  v_msg bigint;
  v_conv uuid;
  v_prop public.companion_proposals%rowtype;
  v_rev bigint;
begin
  if v_type = 'detail.remove' and (jsonb_typeof(p_auth->'removal_confirmed') is distinct from 'boolean'
                                   or (p_auth->>'removal_confirmed')::boolean is not true) then
    perform public.companion_fail('CA403', 'removal_requires_confirmation');
  end if;
  if v_kind = 'ui_control' then
    if v_type not in ('detail.update', 'detail.remove') then
      perform public.companion_fail('CA403', 'invalid_authorization');
    end if;
    return null;
  elsif v_kind = 'direct_command' then
    v_msg := public.companion_nonneg_int(p_auth->'message_id', 9);
    if v_msg is null or v_type <> 'detail.create'
       or exists (select 1 from jsonb_object_keys(p_auth) k where k not in ('kind', 'message_id')) then
      perform public.companion_fail('CA403', 'invalid_authorization');
    end if;
    select c.conversation_identifier into v_conv
      from public.messages m join public.conversations c on c.id = m.conversation_id
     where m.id = v_msg::int and c.user_id = p_user and m.role = 'user';
    if not found then
      perform public.companion_fail('CA403', 'invalid_authorization');
    end if;
    begin
      insert into public.companion_command_uses (user_id, message_id, operation_id)
      values (p_user, v_msg, coalesce(nullif(current_setting('companion.operation_id', true), '')::uuid, gen_random_uuid()));
    exception when unique_violation then
      perform public.companion_fail('CA412', 'command_already_used');
    end;
    perform set_config('companion.detail_source', jsonb_build_object(
      'kind', 'direct_command', 'conversation_id', v_conv, 'message_id', v_msg)::text, true);
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
     returning * into v_prop;
    if v_prop.id is null then
      perform public.companion_fail('CA403', 'invalid_authorization');
    end if;
    if v_type = 'detail.create' then
      if v_prop.kind is distinct from 'detail_create' then
        perform public.companion_fail('CA403', 'invalid_authorization');
      end if;
      perform set_config('companion.detail_source', (jsonb_build_object(
        'kind', 'approved_proposal', 'proposal_id', v_prop.id) || coalesce(v_prop.source, '{}'::jsonb))::text, true);
      return null;
    end if;
    -- Any other detail change by approval is the reviewed change of an Undo of a receipt
    -- of this same detail.
    if not exists (
      select 1 from public.companion_action_receipts r
       where r.user_id = p_user and r.operation_id = v_prop.undo_of
         and r.outcome->'results'->0->>'type' like 'detail.%'
         and r.outcome->'results'->0->>'detail_id' = p_ops->0->>'detail_id') then
      perform public.companion_fail('CA403', 'invalid_authorization');
    end if;
    return v_prop.undo_of;
  end if;
  perform public.companion_fail('CA403', 'invalid_authorization');
  return null;
end $$;

-- Undo of a receipt of a detail operation. Applies its recorded inverse when the detail is
-- still at the revision the receipt produced; otherwise nothing changes and a reviewed
-- compensating change at the current revision is returned. Removing a detail (the Undo
-- of a save or of a restore) needs removal_confirmed.
create function public.companion_undo_detail(
  p_user uuid, p_operation_id uuid, p_hash text, p_contract_version integer, p_authorization jsonb,
  p_target public.companion_action_receipts
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_inv jsonb := p_target.inverse->0;
  v_type text := p_target.inverse->0->>'type';
  v_removes boolean := (p_target.inverse->0->>'type') = 'detail.remove';
  v_row public.companion_saved_details%rowtype;
  v_ops jsonb;
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
  v_row := public.companion_detail_row(p_user, v_inv->'detail_id');
  -- A concurrent Undo of the same receipt may have committed while this one waited.
  if exists (select 1 from public.companion_action_receipts
              where user_id = p_user and undo_of = p_target.operation_id) then
    perform public.companion_fail('CA411', 'already_undone', jsonb_build_object('receipt_operation_id', p_target.operation_id));
  end if;

  if v_row.revision <> (v_inv->>'expected_revision')::bigint then
    if v_type <> 'detail.restore' and v_row.removed_at is not null then
      perform public.companion_fail('CA422', 'detail_removed', jsonb_build_object('detail_id', v_row.id));
    end if;
    if v_type = 'detail.restore' and v_row.removed_at is null then
      perform public.companion_fail('CA422', 'detail_not_removed', jsonb_build_object('detail_id', v_row.id));
    end if;
    v_ops := jsonb_build_array(v_inv || jsonb_build_object('expected_revision', v_row.revision));
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
      'current_detail', jsonb_build_object('detail_id', v_row.id, 'text', v_row.body, 'revision', v_row.revision,
                                           'removed', v_row.removed_at is not null),
      'proposal', jsonb_build_object('proposal_id', v_prop.id, 'proposal_revision', v_prop.revision,
                                     'operations', v_prop.operations));
  end if;

  return public.companion_record(p_user, p_operation_id, p_hash, p_contract_version,
    jsonb_build_object('kind', 'ui_control', 'undo_of', p_target.operation_id)
      || case when v_removes then jsonb_build_object('removal_confirmed', true) else '{}'::jsonb end,
    jsonb_build_array(public.companion_apply_detail(p_user, v_inv)), p_target.operation_id);
end $$;

-- Live details of this account, oldest first.
create function public.companion_read_details(p_user_id uuid) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'detail_id', d.id, 'text', d.body, 'scope', d.scope, 'revision', d.revision,
           'source', jsonb_build_object('kind', d.source->>'kind', 'conversation_id', d.source->>'conversation_id'),
           'created_at', d.created_at, 'updated_at', d.updated_at)
         order by d.created_at, d.id), '[]'::jsonb)
    from public.companion_saved_details d
   where d.user_id = p_user_id and d.removed_at is null
$$;

-- The relevant context of a detail draft: live details with the same text (shown in
-- review; an approval that meets a new one needs a new review).
create function public.companion_detail_context(p_user uuid, p_ops jsonb) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object('same_text_details', public.companion_same_text_details(p_user, p_ops->0->>'text'))
$$;

-- ------------------------------------------------ shared action functions (#361/#363/#366)
-- Each keeps its accepted #366 body verbatim and adds only the marked #370 lines.

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
  -- #370: a saved-detail operation has its own authorization rules.
  if p_ops->0->>'type' like 'detail.%' then
    return public.companion_detail_authorization(p_user, p_ops, p_auth);
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
  -- #370: a saved-detail operation is executed by the detail domain.
  if p_op->>'type' like 'detail.%' then
    return public.companion_apply_detail(p_user, p_op);
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
          or (v_prop.kind = 'step_create' and p_operations->0->>'type' = 'step.create')
          or (v_prop.kind = 'detail_create' and p_operations->0->>'type' = 'detail.create')) then
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
   where id = p_proposal_id and user_id = p_user_id and kind in ('task_create', 'step_create', 'detail_create') for update;
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
  if not found or coalesce(v_prop.kind, '') not in ('task_create', 'step_create', 'detail_create') or v_prop.status <> 'draft'
     or v_prop.revision is distinct from public.companion_nonneg_int(p_auth->'proposal_revision', 9)
     or v_prop.operations_hash <> public.companion_ops_hash(p_ops) then
    return null;
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
                   where p.user_id = p_user_id and p.kind in ('task_create', 'step_create')
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

create or replace function public.companion_proposal_context(p_user uuid, p_ops jsonb) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when p_ops->0->>'type' = 'step.create' then public.companion_step_context(p_user, p_ops)
              -- #370: a suggested detail.
              when p_ops->0->>'type' = 'detail.create' then public.companion_detail_context(p_user, p_ops)
              else public.companion_create_context(p_user, p_ops) end
$$;

-- ------------------------------------------------------------------ grants
revoke all on function
  public.companion_detail_text_ok(jsonb), public.companion_detail_validate(jsonb),
  public.companion_details_lock(uuid), public.companion_same_text_details(uuid, text, uuid),
  public.companion_detail_row(uuid, jsonb), public.companion_apply_detail(uuid, jsonb),
  public.companion_detail_authorization(uuid, jsonb, jsonb),
  public.companion_undo_detail(uuid, uuid, text, integer, jsonb, public.companion_action_receipts),
  public.companion_read_details(uuid), public.companion_detail_context(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.companion_read_details(uuid) to service_role;
