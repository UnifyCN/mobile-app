create function public.companion_proposal_context(p_user uuid, p_ops jsonb) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select case when p_ops->0->>'type' = 'step.create' then public.companion_step_context(p_user, p_ops)
              else public.companion_create_context(p_user, p_ops) end
$$;