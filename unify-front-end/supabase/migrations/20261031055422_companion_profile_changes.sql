-- #371. Extend the current #361-#370 composition. Existing profile fields stay authoritative.
-- The paired rollback restores the full previous functions by name. No accepted body is copied.
alter table public.companion_proposals drop constraint companion_proposals_kind_check;
alter table public.companion_proposals add constraint companion_proposals_kind_check
  check(kind is null or kind in ('compensation','task_create','step_create','task_edit','detail_create','task_remove','reminder','profile_update'));
alter table public.user_onboarding_profiles add column companion_field_revisions jsonb not null
  default '{"province":1,"arrival_date":1,"city":1}'::jsonb;

-- A down-period write cannot make an earlier receipt current again. Restore only
-- revision metadata and advance every tracked field. Never restore profile facts.
do $recover_revisions$
begin
  if to_regclass('public.companion_rollback_archive_371') is null then return;end if;
  update public.user_onboarding_profiles p set companion_field_revisions=jsonb_build_object(
    'province',(a.row_data->'revisions'->>'province')::bigint+1,
    'arrival_date',(a.row_data->'revisions'->>'arrival_date')::bigint+1,
    'city',(a.row_data->'revisions'->>'city')::bigint+1)
  from (select distinct on (row_data->>'id') row_data from public.companion_rollback_archive_371
    where source='revisions' and restored_at is null order by row_data->>'id',id desc) a
  where p.id=(a.row_data->>'id')::uuid;
end $recover_revisions$;

create schema companion_profile_private;
revoke all on schema companion_profile_private from public, anon, authenticated;

-- Legacy writes already hold the profile row lock when this trigger runs. Task/plan
-- checks take only this advisory lock and read the profile with MVCC. They never take
-- the profile row lock, so a waiting legacy writer cannot form a row/advisory cycle.
create function companion_profile_private.track() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
declare k text;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.id::text || ':profile',371));
  new.companion_field_revisions := case when tg_op='INSERT'
    then '{"province":1,"arrival_date":1,"city":1}'::jsonb else old.companion_field_revisions end;
  if tg_op='UPDATE' then
    for k in select unnest(array['province','arrival_date','city']) loop
      if to_jsonb(new)->k is distinct from to_jsonb(old)->k then
        new.companion_field_revisions := jsonb_set(new.companion_field_revisions,array[k],
          to_jsonb((old.companion_field_revisions->>k)::bigint+1));
      end if;
    end loop;
  end if;
  return new;
end $$;
create trigger companion_profile_track before insert or update on public.user_onboarding_profiles
  for each row execute function companion_profile_private.track();

create function public.companion_read_profile(p_user_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('province',p.province,'arrival_date',left(p.arrival_date::text,10),
    'city',p.city,'revisions',p.companion_field_revisions)
  from public.user_onboarding_profiles p where p.id=p_user_id
$$;

alter function public.companion_profile_context(uuid) rename to companion_before371_context;
create function public.companion_profile_context(p_user uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare value jsonb; revisions jsonb;
begin
  -- This includes a missing profile: a first legacy INSERT takes the same lock.
  -- Hold through the task/plan transaction, rather than merely checking before it.
  perform pg_advisory_xact_lock_shared(hashtextextended(p_user::text || ':profile',371));
  value:=public.companion_before371_context(p_user);
  select companion_field_revisions into revisions from public.user_onboarding_profiles where id=p_user;
  return case when value is null then null else value || jsonb_build_object('_revisions',revisions) end;
end $$;

alter function public.companion_validate_operations(jsonb) rename to companion_before371_validate;
create function public.companion_validate_operations(p_ops jsonb) returns void
language plpgsql set search_path=public,pg_temp as $$
declare o jsonb:=p_ops->0; k text; d date;
begin
  if coalesce(o->>'type','')<>'profile.update' then perform public.companion_before371_validate(p_ops);return;end if;
  if jsonb_typeof(p_ops) is distinct from 'array' or jsonb_array_length(p_ops)<>1 then
    perform public.companion_fail('CA422','invalid_operations');end if;
  for k in select jsonb_object_keys(o) loop
    if k not in ('type','field','value','expected_revision') then perform public.companion_fail('CA422','unknown_field');end if;
  end loop;
  if coalesce(o->>'field','') not in ('province','arrival_date') then perform public.companion_fail('CA422','unsupported_profile_field');end if;
  if public.companion_nonneg_int(o->'expected_revision',15) is null then perform public.companion_fail('CA422','expected_revision_required');end if;
  if not (o ? 'value') or jsonb_typeof(o->'value') not in ('string','null') then perform public.companion_fail('CA422','invalid_profile_value');end if;
  if o->'value'='null'::jsonb then return;end if;
  if o->>'field'='province' then
    if char_length(o->>'value') not between 1 and 200 or o->>'value'<>btrim(o->>'value') or o->>'value' ~ '[[:cntrl:]]' then
      perform public.companion_fail('CA422','invalid_profile_value');end if;
  else
    if o->>'value' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then perform public.companion_fail('CA422','invalid_profile_value');end if;
    begin d:=(o->>'value')::date;
      if d<'0001-01-01'::date or to_char(d,'YYYY-MM-DD')<>o->>'value' then perform public.companion_fail('CA422','invalid_profile_value');end if;
    exception when invalid_datetime_format or datetime_field_overflow then perform public.companion_fail('CA422','invalid_profile_value');end;
  end if;
end $$;

-- New values match the existing controls. Only a verified receipt inverse may
-- restore a legacy custom value or an arrival date now outside the picker range.
create function companion_profile_private.check_value(p_op jsonb) returns void
language plpgsql set search_path=public,pg_temp as $$
begin
  if p_op->'value'='null'::jsonb then perform public.companion_fail('CA422','invalid_profile_value');end if;
  if p_op->>'field'='province' then
    if p_op->>'value' not in ('Alberta','British Columbia','Manitoba','New Brunswick','Newfoundland and Labrador',
      'Northwest Territories','Nova Scotia','Nunavut','Ontario','Prince Edward Island','Quebec','Saskatchewan','Yukon') then
      perform public.companion_fail('CA422','invalid_profile_value');end if;
  elsif (p_op->>'value')::date not between (current_date-interval '5 years')::date and (current_date+interval '3 years')::date then
    perform public.companion_fail('CA422','invalid_profile_value');
  end if;
end $$;

alter function public.companion_check_authorization(uuid,jsonb,jsonb) rename to companion_before371_authorization;
create function public.companion_check_authorization(p_user uuid,p_ops jsonb,p_auth jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare msg bigint; target uuid;
begin
  if coalesce(p_ops->0->>'type','')<>'profile.update' then return public.companion_before371_authorization(p_user,p_ops,p_auth);end if;
  if p_auth->>'kind'='direct_command' then
    msg:=public.companion_nonneg_int(p_auth->'message_id',9);
    if msg is null or not exists(select 1 from public.messages m join public.conversations c on c.id=m.conversation_id
      where m.id=msg and c.user_id=p_user and m.role='user') then perform public.companion_fail('CA403','invalid_authorization');end if;
    begin insert into public.companion_command_uses(user_id,message_id,operation_id)
      values(p_user,msg,current_setting('companion.operation_id')::uuid);
    exception when unique_violation then perform public.companion_fail('CA412','command_already_used');end;
    return null;
  end if;
  if p_auth->>'kind'='approved_proposal' then
    update public.companion_proposals set status='applied',updated_at=now()
      where id=(p_auth->>'proposal_id')::uuid and user_id=p_user and kind='profile_update' and status='draft'
        and revision=public.companion_nonneg_int(p_auth->'proposal_revision',9)
        and operations_hash=public.companion_ops_hash(p_ops) returning undo_of into target;
    if not found then perform public.companion_fail('CA403','invalid_authorization');end if;
    if target is not null and exists(select 1 from public.companion_action_receipts where user_id=p_user and undo_of=target) then
      perform public.companion_fail('CA411','already_undone');end if;
    if target is not null then
      if not exists(select 1 from public.companion_action_receipts r where r.user_id=p_user and r.operation_id=target
        and r.inverse->0->>'type'='profile.update' and r.inverse->0->'field'=p_ops->0->'field'
        and r.inverse->0->'value'=p_ops->0->'value') then perform public.companion_fail('CA403','invalid_authorization');end if;
      perform set_config('companion.profile_undo','true',true);
    end if;
    return target;
  end if;
  perform public.companion_fail('CA403','invalid_authorization');return null;
end $$;

alter function public.companion_undo_action(uuid,uuid,integer,jsonb,uuid) rename to companion_before371_undo;
create function public.companion_undo_action(p_user_id uuid,p_operation_id uuid,p_contract_version integer,p_authorization jsonb,p_receipt_operation_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.companion_action_receipts%rowtype; h text; replay jsonb; ctx jsonb; ops jsonb; p public.companion_proposals%rowtype;
begin
  select * into t from public.companion_action_receipts where user_id=p_user_id and operation_id=p_receipt_operation_id;
  if not found or coalesce(t.outcome->'results'->0->>'type','')<>'profile.update' then
    return public.companion_before371_undo(p_user_id,p_operation_id,p_contract_version,p_authorization,p_receipt_operation_id);end if;
  h:=public.companion_ops_hash(jsonb_build_object('undo',p_receipt_operation_id));
  replay:=public.companion_replay(p_user_id,p_operation_id,h);
  if replay is not null then return replay;end if;
  if p_authorization->>'kind' is distinct from 'ui_control' then perform public.companion_fail('CA403','invalid_authorization');end if;
  if t.inverse is null then perform public.companion_fail('CA422','undo_unavailable');end if;
  ctx:=companion_profile_private.context(p_user_id,t.inverse->0->>'field');
  if exists(select 1 from public.companion_action_receipts where user_id=p_user_id and undo_of=p_receipt_operation_id) then
    perform public.companion_fail('CA411','already_undone');end if;
  if ctx->'revision' is distinct from t.inverse->0->'expected_revision' then
    ops:=jsonb_build_array((t.inverse->0)||jsonb_build_object('expected_revision',ctx->'revision'));
    select * into p from public.companion_proposals where user_id=p_user_id and undo_of=p_receipt_operation_id
      and kind='profile_update' and status='draft' and context=ctx and operations_hash=public.companion_ops_hash(ops)
      order by created_at desc limit 1;
    if not found then
      insert into public.companion_proposals(user_id,operations,operations_hash,undo_of,kind,context,updated_at)
        values(p_user_id,ops,public.companion_ops_hash(ops),p_receipt_operation_id,'profile_update',ctx,now()) returning * into p;
    end if;
    return jsonb_build_object('conflict',true,'receipt_operation_id',p_receipt_operation_id,'current','[]'::jsonb,
      'current_profile',ctx,'proposal',public.companion_proposal_view(p));
  end if;
  perform set_config('companion.profile_undo','true',true);
  return public.companion_record(p_user_id,p_operation_id,h,p_contract_version,
    jsonb_build_object('kind','ui_control','undo_of',p_receipt_operation_id),
    jsonb_build_array(public.companion_apply_one(p_user_id,t.inverse->0)),p_receipt_operation_id);
end $$;

-- A profile review locks its proposal, then the existing profile row, then the
-- account's profile lock. The row lock precedes the lock used by legacy triggers.
create function companion_profile_private.context(p_user uuid,p_field text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.user_onboarding_profiles%rowtype;
begin
  select * into p from public.user_onboarding_profiles where id=p_user for update;
  if not found then perform public.companion_fail('CA404','profile_not_found');end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':profile',371));
  return jsonb_build_object('field',p_field,'value',case when p_field='province' then p.province else left(p.arrival_date::text,10) end,
    'revision',p.companion_field_revisions->p_field);
end $$;

alter function public.companion_prepare_proposal(uuid,jsonb,jsonb) rename to companion_before371_prepare;
create function public.companion_prepare_proposal(p_user_id uuid,p_operations jsonb,p_source jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare ctx jsonb; src jsonb; ops jsonb; p public.companion_proposals%rowtype;
begin
  if coalesce(p_operations->0->>'type','')<>'profile.update' then return public.companion_before371_prepare(p_user_id,p_operations,p_source);end if;
  perform public.companion_validate_operations(p_operations);
  perform companion_profile_private.check_value(p_operations->0);
  src:=public.companion_check_source(p_user_id,p_source);
  ctx:=companion_profile_private.context(p_user_id,p_operations->0->>'field');
  ops:=jsonb_build_array((p_operations->0)||jsonb_build_object('expected_revision',ctx->'revision'));
  insert into public.companion_proposals(user_id,operations,operations_hash,kind,context,source,updated_at)
    values(p_user_id,ops,public.companion_ops_hash(ops),'profile_update',ctx,src,now()) returning * into p;
  return public.companion_proposal_view(p);
end $$;

alter function public.companion_recheck_proposal(uuid,jsonb,jsonb) rename to companion_before371_recheck;
create function public.companion_recheck_proposal(p_user uuid,p_ops jsonb,p_auth jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.companion_proposals%rowtype; ctx jsonb; ops jsonb;
begin
  if coalesce(p_ops->0->>'type','')<>'profile.update' then return public.companion_before371_recheck(p_user,p_ops,p_auth);end if;
  if p_auth->>'kind' is distinct from 'approved_proposal' then return null;end if;
  select * into p from public.companion_proposals where id=(p_auth->>'proposal_id')::uuid and user_id=p_user for update;
  if not found or p.kind<>'profile_update' or p.status<>'draft' or p.revision is distinct from public.companion_nonneg_int(p_auth->'proposal_revision',9)
    or p.operations_hash<>public.companion_ops_hash(p_ops) then perform public.companion_fail('CA403','invalid_authorization');end if;
  ctx:=companion_profile_private.context(p_user,p_ops->0->>'field');
  if ctx=p.context then return null;end if;
  ops:=jsonb_build_array((p_ops->0)||jsonb_build_object('expected_revision',ctx->'revision'));
  update public.companion_proposals set operations=ops,operations_hash=public.companion_ops_hash(ops),revision=revision+1,
    previous_context=context,context=ctx,review_reason='context_changed',updated_at=now() where id=p.id returning * into p;
  return public.companion_proposal_view(p);
end $$;

alter function public.companion_cancel_proposal(uuid,uuid,integer) rename to companion_before371_cancel;
create function public.companion_cancel_proposal(p_user_id uuid,p_proposal_id uuid,p_proposal_revision integer) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.companion_proposals%rowtype;
begin
  select * into p from public.companion_proposals where id=p_proposal_id and user_id=p_user_id;
  if not found or p.kind<>'profile_update' then return public.companion_before371_cancel(p_user_id,p_proposal_id,p_proposal_revision);end if;
  select * into p from public.companion_proposals where id=p_proposal_id and user_id=p_user_id for update;
  if p.status<>'draft' or p.revision<>p_proposal_revision then return jsonb_build_object('changed',true,'proposal',public.companion_proposal_view(p));end if;
  update public.companion_proposals set status='cancelled',updated_at=now() where id=p.id returning * into p;
  return jsonb_build_object('proposal',public.companion_proposal_view(p));
end $$;

alter function public.companion_conversation_actions(uuid,uuid) rename to companion_before371_conversation;
create function public.companion_conversation_actions(p_user_id uuid,p_conversation_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
  result:=public.companion_before371_conversation(p_user_id,p_conversation_id);
  -- Older clients parse only their known command types.
  result:=jsonb_set(result,'{commands}',coalesce((select jsonb_agg(c) from jsonb_array_elements(result->'commands') c
    where c->'receipt'->>'operation_type'<>'profile.update'),'[]'::jsonb));
  return result || jsonb_build_object(
    'profile_proposals',(select coalesce(jsonb_agg(public.companion_proposal_view(p) order by p.created_at),'[]'::jsonb)
      from public.companion_proposals p where p.user_id=p_user_id and p.kind='profile_update'
        and p.source->>'conversation_id'=p_conversation_id::text),
    'profile_commands',(select coalesce(jsonb_agg(jsonb_build_object('message_id',u.message_id,'operation_id',u.operation_id,'receipt',public.companion_receipt_summary(r)) order by u.created_at),'[]'::jsonb)
      from public.companion_command_uses u join public.messages m on m.id=u.message_id
      join public.conversations c on c.id=m.conversation_id
      join public.companion_action_receipts r on r.user_id=u.user_id and r.operation_id=u.operation_id
      where u.user_id=p_user_id and c.conversation_identifier=p_conversation_id and c.user_id=p_user_id
        and r.outcome->'results'->0->>'type'='profile.update'));
end $$;

alter function public.companion_apply_one(uuid,jsonb) rename to companion_before371_apply_one;
create function public.companion_apply_one(p_user uuid,p_op jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.user_onboarding_profiles%rowtype; a public.user_onboarding_profiles%rowtype;
  f text:=p_op->>'field'; prior jsonb; rev bigint; d date; v_stage integer;
begin
  if coalesce(p_op->>'type','')<>'profile.update' then return public.companion_before371_apply_one(p_user,p_op);end if;
  if coalesce(current_setting('companion.profile_undo',true),'')<>'true' then
    perform companion_profile_private.check_value(p_op);end if;
  select * into p from public.user_onboarding_profiles where id=p_user for update;
  if not found then perform public.companion_fail('CA404','profile_not_found');end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text || ':profile',371));
  rev:=(p.companion_field_revisions->>f)::bigint;
  if rev is distinct from (p_op->>'expected_revision')::bigint then
    perform public.companion_fail('CA409','revision_conflict',jsonb_build_object('field',f,'actual',rev));end if;
  prior:=case when f='arrival_date' then to_jsonb(left(p.arrival_date::text,10)) else to_jsonb(p.province) end;
  if f='province' then update public.user_onboarding_profiles set province=p_op->>'value',updated_at=now() where id=p_user returning * into a;
  else
    d:=(p_op->>'value')::date;
    v_stage:=case when d is null or d>current_date then 0 when current_date<(d+interval '3 months')::date then 1
      when current_date<(d+interval '12 months')::date then 2 when current_date<(d+interval '36 months')::date then 3 else 4 end;
    -- jsonb_populate_record respects the installed stage type (hosted enum or smallint).
    update public.user_onboarding_profiles set arrival_date=d,
      stage=(jsonb_populate_record(null::public.user_onboarding_profiles,jsonb_build_object('stage',v_stage))).stage,
      updated_at=now() where id=p_user returning * into a;
  end if;
  return jsonb_build_object('type','profile.update','field',f,'before',prior,'after',p_op->'value',
    'before_revision',rev,'after_revision',(a.companion_field_revisions->>f)::bigint,
    'inverse',jsonb_build_object('type','profile.update','field',f,'value',prior,
      'expected_revision',(a.companion_field_revisions->>f)::bigint));
end $$;

alter function public.companion_receipt_summary(public.companion_action_receipts) rename to companion_before371_receipt;
create function public.companion_receipt_summary(p_receipt public.companion_action_receipts) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select public.companion_before371_receipt(p_receipt) ||
    case when r->>'type'='profile.update' then jsonb_build_object(
      'profile',jsonb_build_object('field',r->'field','before',r->'before','after',r->'after'),
      'current',not exists(select 1 from public.companion_action_receipts u where u.user_id=p_receipt.user_id and u.undo_of=p_receipt.operation_id)
        and exists(select 1 from public.user_onboarding_profiles p where p.id=p_receipt.user_id
          and p.companion_field_revisions->(r->>'field')=r->'after_revision')) else '{}'::jsonb end
  from (select p_receipt.outcome->'results'->0 r) x
$$;

do $recover_history$
begin
  if to_regclass('public.companion_rollback_archive_371') is null then return;end if;
  insert into public.companion_action_receipts
    select (jsonb_populate_record(null::public.companion_action_receipts,a.row_data)).*
    from public.companion_rollback_archive_371 a where a.source='receipt' and a.restored_at is null
      and exists(select 1 from auth.users u where u.id=(a.row_data->>'user_id')::uuid)
    order by a.id on conflict do nothing;
  insert into public.companion_proposals
    select (jsonb_populate_record(null::public.companion_proposals,case when a.row_data->>'status'='draft' then
      a.row_data||jsonb_build_object('revision',(a.row_data->>'revision')::integer+1,'review_reason','restored',
        'previous_context',null,'context',companion_profile_private.context((a.row_data->>'user_id')::uuid,a.row_data->'operations'->0->>'field'),
        'operations',jsonb_build_array((a.row_data->'operations'->0)||jsonb_build_object('expected_revision',
          p.companion_field_revisions->(a.row_data->'operations'->0->>'field'))),
        'operations_hash',public.companion_ops_hash(jsonb_build_array((a.row_data->'operations'->0)||jsonb_build_object('expected_revision',
          p.companion_field_revisions->(a.row_data->'operations'->0->>'field')))))
      else a.row_data end)).*
    from public.companion_rollback_archive_371 a join public.user_onboarding_profiles p on p.id=(a.row_data->>'user_id')::uuid
    where a.source='proposal' and a.restored_at is null order by a.id on conflict do nothing;
  update public.companion_rollback_archive_371 set restored_at=now() where restored_at is null;
end $recover_history$;

revoke all on all functions in schema companion_profile_private from public,anon,authenticated;
revoke all on function public.companion_read_profile(uuid),public.companion_validate_operations(jsonb),
  public.companion_check_authorization(uuid,jsonb,jsonb),public.companion_apply_one(uuid,jsonb),
  public.companion_receipt_summary(public.companion_action_receipts),public.companion_prepare_proposal(uuid,jsonb,jsonb),
  public.companion_recheck_proposal(uuid,jsonb,jsonb),public.companion_cancel_proposal(uuid,uuid,integer),
  public.companion_conversation_actions(uuid,uuid),public.companion_undo_action(uuid,uuid,integer,jsonb,uuid),
  public.companion_profile_context(uuid) from public,anon,authenticated;
grant execute on function public.companion_read_profile(uuid),public.companion_validate_operations(jsonb),
  public.companion_check_authorization(uuid,jsonb,jsonb),public.companion_apply_one(uuid,jsonb),
  public.companion_receipt_summary(public.companion_action_receipts),public.companion_prepare_proposal(uuid,jsonb,jsonb),
  public.companion_recheck_proposal(uuid,jsonb,jsonb),public.companion_cancel_proposal(uuid,uuid,integer),
  public.companion_conversation_actions(uuid,uuid),public.companion_undo_action(uuid,uuid,integer,jsonb,uuid),
  public.companion_profile_context(uuid) to service_role;
notify pgrst,'reload schema';
