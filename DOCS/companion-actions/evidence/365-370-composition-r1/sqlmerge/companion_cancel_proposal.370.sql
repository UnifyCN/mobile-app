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