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
