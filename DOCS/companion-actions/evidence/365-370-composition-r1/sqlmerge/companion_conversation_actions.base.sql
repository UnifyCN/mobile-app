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