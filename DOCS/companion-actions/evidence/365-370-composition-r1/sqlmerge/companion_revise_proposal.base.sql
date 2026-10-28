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