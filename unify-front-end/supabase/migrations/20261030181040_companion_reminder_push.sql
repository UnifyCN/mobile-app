-- #369. MOBILE authority. WEB mirrors these exact bytes and this identity.
-- Keep #368 schedule/history and all lifecycle writers unchanged. No send Cron.
-- Private tombstones survive rollback/reapply. Never restore execution authority.
create schema if not exists companion_push_private;
revoke all on schema companion_push_private from public,anon,authenticated,service_role;
create table if not exists companion_push_private.settings (
 singleton boolean primary key default true check(singleton),
 enrollment_enabled boolean not null default false, dispatch_enabled boolean not null default false, dispatch_not_before timestamptz,
 maximum_seconds integer check(maximum_seconds>=0), inactivity_seconds integer check(inactivity_seconds>=0),
 policy_verified_at timestamptz, policy_valid_until timestamptz,
 companion_per_minute integer check(companion_per_minute between 1 and 600),
 provider_project_per_second integer check(provider_project_per_second between 1 and 600),
 other_senders_reserved_per_second integer check(other_senders_reserved_per_second between 0 and 599),
 aggregate_verified_at timestamptz, aggregate_valid_until timestamptz,
 receipt_per_minute integer check(receipt_per_minute between 1 and 600),
 retry_seconds integer not null default 30 check(retry_seconds between 30 and 3600),
 attempt_cap integer not null default 3 check(attempt_cap between 1 and 3)
);
insert into companion_push_private.settings(singleton) values(true) on conflict do nothing;
-- Reapply is always dark. An operator must verify current policy and capacity again.
update companion_push_private.settings set enrollment_enabled=false,dispatch_enabled=false,
 policy_verified_at=null,policy_valid_until=null,aggregate_verified_at=null,aggregate_valid_until=null;
create table if not exists companion_push_private.enrollments (
 installation_id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 session_id uuid not null, token_id uuid references public.push_tokens(id) on delete set null,
 generation uuid not null default gen_random_uuid(), revision bigint not null default 1,
 enabled boolean not null, locale text not null check(locale in ('ar','en','es','fr-CA','hi','pa','vi')),
 credential_hash bytea not null check(octet_length(credential_hash)=32), revoked_at timestamptz,
 registered_at timestamptz not null default now(), unique(token_id)
);
create table if not exists companion_push_private.deliveries (
 id uuid primary key default gen_random_uuid(), reminder_id uuid not null,
 user_id uuid not null references auth.users(id) on delete cascade, task_ref text not null check(task_ref ~ '^(sanity:(?!drafts\.|versions\.)[A-Za-z0-9][A-Za-z0-9._-]{0,127}|custom:[1-9][0-9]{0,17})$'),
 installation_id uuid not null, generation uuid not null, token_id uuid not null,
 state text not null default 'queued' check(state in ('queued','dispatching','unknown','suppressed','cancelled','retry_wait','ticket_accepted','receipt_pending','provider_accepted','permanent_failure','receipt_expired')),
 attempt_count integer not null default 0 check(attempt_count between 0 and 3),
 next_attempt_at timestamptz not null default now(), ticket text, receipt text,
 ticket_at timestamptz, receipt_check_at timestamptz, created_at timestamptz not null default now(),
 device_display text not null default 'not_observed' check(device_display='not_observed'),
 unique(reminder_id,installation_id)
);
create index if not exists companion_push_delivery_ready on companion_push_private.deliveries(state,next_attempt_at);
create table if not exists companion_push_private.events (
 reminder_id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 consumed_at timestamptz not null default now(), reason text not null
);
create table if not exists companion_push_private.attempts (
 id uuid primary key, delivery_id uuid not null references companion_push_private.deliveries(id) on delete cascade,
 number integer not null, outcome text not null default 'dispatching', ticket text,
 created_at timestamptz not null default now(), unique(delivery_id,number)
);
create table if not exists companion_push_private.budget (
 singleton boolean primary key default true check(singleton), second_at timestamptz not null default now(),
 minute_at timestamptz not null default now(), sends_second integer not null default 0,
 sends_minute integer not null default 0, receipts_minute integer not null default 0,
 blocked_until timestamptz not null default now()
);
insert into companion_push_private.budget(singleton) values(true) on conflict do nothing;
-- A newly introduced worker must not send pre-feature due events.
insert into companion_push_private.events(reminder_id,user_id,reason)
 select reminder_id,user_id,'pre_enablement' from companion_reminder_private.events on conflict do nothing;
alter table companion_push_private.settings enable row level security;
alter table companion_push_private.enrollments enable row level security;
alter table companion_push_private.deliveries enable row level security;
alter table companion_push_private.events enable row level security;
alter table companion_push_private.attempts enable row level security;
alter table companion_push_private.budget enable row level security;
revoke all on all tables in schema companion_push_private from public,anon,authenticated,service_role;

create or replace function companion_push_private.session_authorized(p_session uuid,p_user uuid) returns boolean
language sql volatile security definer set search_path=public,pg_temp as $$
 select exists(select 1 from auth.sessions s join auth.users u on u.id=s.user_id cross join companion_push_private.settings p
 where s.id=p_session and s.user_id=p_user and (s.not_after is null or s.not_after>clock_timestamp())
 and not u.is_anonymous and (u.banned_until is null or u.banned_until<=clock_timestamp())
 and p.policy_verified_at is not null and p.policy_valid_until>clock_timestamp()
 and p.maximum_seconds is not null and p.inactivity_seconds is not null
 and (p.maximum_seconds=0 or s.created_at+p.maximum_seconds*interval '1 second'>clock_timestamp())
 and (p.inactivity_seconds=0 or coalesce(s.refreshed_at at time zone 'UTC',s.created_at)+p.inactivity_seconds*interval '1 second'>clock_timestamp()))
$$;
create or replace function companion_push_private.view_enrollment(n companion_push_private.enrollments) returns jsonb
language sql stable set search_path=public,pg_temp as $$
 select jsonb_build_object('installation_id',n.installation_id,'revision',n.revision,'generation',n.generation,
 'enabled',n.enabled,'revoked',n.revoked_at is not null,'locale',n.locale)
$$;
create or replace function companion_push_private.require_enrollment_authority(p_user uuid,p_session uuid) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 -- Match Auth deletion order before taking the enrollment/token row locks.
 -- These shared locks keep sign-out, bans and policy/gate changes ordered through commit.
 perform 1 from auth.users where id=p_user for share;
 perform 1 from auth.sessions where id=p_session and user_id=p_user for share;
 perform 1 from companion_push_private.settings where singleton for share;
 if not exists(select 1 from companion_push_private.settings where enrollment_enabled) then
  perform public.companion_fail('CA503','push_disabled');end if;
 if p_user is null or not companion_push_private.session_authorized(p_session,p_user) then
  perform public.companion_fail('CA403','active_session_required');end if;
end $$;
create function public.companion_push_apply(p_user uuid,p_session uuid,p_operation_id uuid,p_version integer,p_platform text,p_operation jsonb) returns jsonb
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
  perform companion_push_private.require_enrollment_authority(p_user,p_session);
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
   perform companion_push_private.require_enrollment_authority(p_user,p_session);
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
create function public.companion_push_read(p_user uuid,p_session uuid,p_installation uuid,p_secret text) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare n companion_push_private.enrollments%rowtype;
begin
 if not companion_push_private.session_authorized(p_session,p_user) then perform public.companion_fail('CA403','active_session_required');end if;
 select * into n from companion_push_private.enrollments where installation_id=p_installation and user_id=p_user
  and credential_hash=extensions.digest(p_secret,'sha256');
 if not found then return null;end if;
 return companion_push_private.view_enrollment(n);
end $$;
create function public.companion_push_target(p_user uuid,p_session uuid,p_delivery uuid) returns text
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare ref text;
begin
 if not companion_push_private.session_authorized(p_session,p_user) then perform public.companion_fail('CA403','active_session_required');end if;
 select task_ref into ref from companion_push_private.deliveries where id=p_delivery and user_id=p_user;
 if ref like 'custom:%' then
  if not exists(select 1 from public.custom_checklist_tasks where user_id=p_user and id=substr(ref,8)::bigint and removed_at is null) then return null;end if;
 elsif ref like 'sanity:%' and exists(select 1 from public.user_tasks where user_id=p_user and sanity_checklist_id=substr(ref,8) and dismissed_at is not null) then return null;
 end if;
 return ref;
end $$;
revoke all on all functions in schema companion_push_private from public,anon,authenticated,service_role;
revoke all on function public.companion_push_apply(uuid,uuid,uuid,integer,text,jsonb),public.companion_push_read(uuid,uuid,uuid,text),public.companion_push_target(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.companion_push_apply(uuid,uuid,uuid,integer,text,jsonb),public.companion_push_read(uuid,uuid,uuid,text),public.companion_push_target(uuid,uuid,uuid) to service_role;
notify pgrst,'reload schema';
