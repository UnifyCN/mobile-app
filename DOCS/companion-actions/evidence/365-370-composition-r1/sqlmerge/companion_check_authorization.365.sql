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