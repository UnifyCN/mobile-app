create or replace function companion_push_private.require_enrollment_authority(p_user uuid,p_session uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 -- Match Auth deletion order before taking the enrollment/token row locks.
 -- These shared locks keep sign-out, bans and policy/gate changes ordered through commit.
 if not exists(select 1 from companion_push_private.settings where enrollment_enabled) then
  perform public.companion_fail('CA503','push_disabled');end if;
 if p_user is null or not companion_push_private.session_authorized(p_session,p_user) then
  perform public.companion_fail('CA403','active_session_required');end if;
end $$;
