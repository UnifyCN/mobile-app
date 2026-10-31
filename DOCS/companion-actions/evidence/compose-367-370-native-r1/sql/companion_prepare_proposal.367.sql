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
