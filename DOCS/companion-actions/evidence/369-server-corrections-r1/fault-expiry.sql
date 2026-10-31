create or replace function public.companion_push_apply(p_user uuid,p_session uuid,p_operation_id uuid,p_version integer,p_platform text,p_operation jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare n companion_push_private.enrollments%rowtype; tid uuid; prior boolean; result jsonb; receipt public.companion_action_receipts%rowtype;
 replay jsonb; h text; secret text:=p_operation->>'installation_secret'; installation uuid; expected bigint; k text; enrolled boolean;
begin
 if not exists(select 1 from companion_push_private.settings where enrollment_enabled) then
  perform public.companion_fail('CA503','push_disabled');end if;
 if p_user is null or not companion_push_private.session_authorized(p_session,p_user) then
  perform public.companion_fail('CA403','active_session_required');end if;
 if p_version<>1 or p_operation_id is null or p_platform not in ('ios','android') or
  not public.companion_uuid_ok(p_operation->'installation_id') or secret is null or secret !~ '^[0-9a-f]{64}$' or
  public.companion_nonneg_int(p_operation->'expected_revision',15) is null or
  coalesce(p_operation->>'type','') not in ('push.enroll','push.disable','push.revoke') then
  perform public.companion_fail('CA422','invalid_push_operation');end if;
 enrolled:=p_operation->>'type'='push.enroll';
 for k in select jsonb_object_keys(p_operation) loop
  if k not in ('type','installation_id','installation_secret','expected_revision') and
    (not enrolled or k not in ('token','enabled','locale')) then perform public.companion_fail('CA422','unknown_field');end if;
 end loop;
 if enrolled and (jsonb_typeof(p_operation->'enabled') is distinct from 'boolean' or
   coalesce(p_operation->>'token','') !~ '^(ExpoPushToken|ExponentPushToken)\[[A-Za-z0-9_-]{1,200}\]$' or
   coalesce(p_operation->>'locale','') not in ('ar','en','es','fr-CA','hi','pa','vi')) then
  perform public.companion_fail('CA422','invalid_push_operation');end if;
 installation:=(p_operation->>'installation_id')::uuid;expected:=(p_operation->>'expected_revision')::bigint;
 -- Global installation lock orders competing account claims. No reclaim without proof.
 perform set_config('lock_timeout','2s',true);
 perform pg_advisory_xact_lock(hashtextextended(installation::text,369));
  perform companion_push_private.require_enrollment_authority(p_user,p_session);
 select * into n from companion_push_private.enrollments where installation_id=installation for update;
 prior:=found;
 if prior and n.credential_hash<>extensions.digest(secret,'sha256') then perform public.companion_fail('CA403','installation_proof_required');end if;
 -- The hash binds the entire exact request but contains no plaintext credential/token.
 h:=public.companion_ops_hash(jsonb_build_object('push',p_operation,'platform',p_platform));
 replay:=public.companion_replay(p_user,p_operation_id,h);
  -- Recheck clock-based policy/session expiry after the common operation lock wait.

 if replay is not null then return replay;end if;
 if prior and n.revoked_at is not null then perform public.companion_fail('CA403','installation_revoked');end if;
 if prior and n.user_id<>p_user and exists(select 1 from auth.sessions where id=n.session_id) then
  perform public.companion_fail('CA403','installation_still_owned');end if;
 if (case when prior then n.revision else 0 end)<>expected then
  perform public.companion_fail('CA409','revision_conflict',jsonb_build_object('expected',expected,'actual',case when prior then n.revision else 0 end));end if;
 if not enrolled then
  if not prior or n.user_id<>p_user then perform public.companion_fail('CA403','installation_proof_required');end if;
  update companion_push_private.enrollments set enabled=false,generation=gen_random_uuid(),revision=revision+1,
   revoked_at=case when p_operation->>'type'='push.revoke' then now() else revoked_at end
   where installation_id=installation returning * into n;
 else
  perform pg_advisory_xact_lock(hashtextextended(p_operation->>'token',369));
  select id into tid from public.push_tokens where token=p_operation->>'token' for update;
   -- No token or enrollment write may precede this final expiry check.
 
  if tid is not null and exists(select 1 from companion_push_private.enrollments where token_id=tid and installation_id<>installation) then
   perform public.companion_fail('CA409','token_in_use');end if;
  if tid is not null and exists(select 1 from public.push_tokens where id=tid and user_id<>p_user) then
   if not prior or n.token_id is distinct from tid then perform public.companion_fail('CA403','token_owned_elsewhere');end if;
   -- Proven transfer updates only this exact linked row. Other social/learn rows stay.
   update public.push_tokens set user_id=p_user,platform=p_platform,updated_at=now() where id=tid;
  end if;
  if tid is null then insert into public.push_tokens(user_id,token,platform) values(p_user,p_operation->>'token',p_platform) returning id into tid;end if;
  insert into companion_push_private.enrollments(installation_id,user_id,session_id,token_id,enabled,locale,credential_hash)
   values(installation,p_user,p_session,tid,(p_operation->>'enabled')::boolean,p_operation->>'locale',extensions.digest(secret,'sha256'))
   on conflict(installation_id) do update set user_id=excluded.user_id,session_id=excluded.session_id,token_id=excluded.token_id,
    enabled=excluded.enabled,locale=excluded.locale,generation=gen_random_uuid(),revision=companion_push_private.enrollments.revision+1,registered_at=now()
   returning * into n;
 end if;
 result:=companion_push_private.view_enrollment(n)||jsonb_build_object('type',p_operation->>'type','before_revision',expected,'after_revision',n.revision);
 insert into public.companion_action_receipts(user_id,operation_id,request_hash,contract_version,authorization_evidence,outcome,inverse)
 values(p_user,p_operation_id,h,p_version,'{"kind":"ui_control"}',jsonb_build_object('results',jsonb_build_array(result)),null) returning * into receipt;
 return public.companion_reply(receipt,false);
end $$;
