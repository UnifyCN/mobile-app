-- #368. One-shot in-app reminders. Claims are scheduler history, never delivery.
-- The #361 pending status remains cancellable by all accepted lifecycle writers.
create extension if not exists pg_cron;
create schema if not exists companion_reminder_private;
revoke all on schema companion_reminder_private from public, anon, authenticated;
create table if not exists companion_reminder_private.history (
 id bigint generated always as identity primary key, reminder_id uuid not null,
 user_id uuid not null references auth.users(id) on delete cascade, at timestamptz not null default clock_timestamp(), value jsonb not null
);
create table if not exists companion_reminder_private.events (
 reminder_id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade, due_at timestamptz not null default clock_timestamp()
);
create table if not exists companion_reminder_private.runs (
 id bigint generated always as identity primary key, at timestamptz not null default clock_timestamp(),
 attempted integer not null, claimed integer not null, failed integer not null
);
create table if not exists companion_reminder_private.scan_state (
 singleton boolean primary key default true check(singleton), last_id uuid not null default '00000000-0000-0000-0000-000000000000'
);
insert into companion_reminder_private.scan_state(singleton) values(true) on conflict do nothing;
alter table companion_reminder_private.scan_state enable row level security;
create table if not exists companion_reminder_private.archive (
 source text not null, identity text not null, row_data jsonb not null, user_id uuid not null references auth.users(id) on delete cascade, primary key(source,identity)
);
create index if not exists companion_reminder_history_owner on companion_reminder_private.history(user_id,reminder_id,id);
create index if not exists companion_reminder_runs_at on companion_reminder_private.runs(at desc);
alter table companion_reminder_private.history enable row level security;
alter table companion_reminder_private.events enable row level security;
alter table companion_reminder_private.runs enable row level security;
alter table companion_reminder_private.archive enable row level security;
revoke all on all tables in schema companion_reminder_private from public,anon,authenticated;

alter table public.companion_task_reminders add column revision bigint not null default 1,
 add column wall_time timestamp,
 add column replaces_id uuid,
 add column next_attempt_at timestamptz not null default clock_timestamp(),
 add column attempt_count integer not null default 0,
 add column last_error text;
-- Pre-feature legacy rows have no reviewed explicit wall time. Keep their history,
-- but do not start them with the new worker.
update public.companion_task_reminders set status='cancelled',cancelled_reason='service_interruption',cancelled_at=clock_timestamp()
 where status='pending';
create unique index companion_reminders_one_pending on public.companion_task_reminders(user_id,task_ref) where status='pending';
create index companion_reminders_due on public.companion_task_reminders(next_attempt_at,remind_at,id) where status='pending';
alter table public.companion_proposals drop constraint companion_proposals_kind_check;
alter table public.companion_proposals add constraint companion_proposals_kind_check
 check(kind is null or kind in ('compensation','task_create','step_create','task_edit','detail_create','task_remove','reminder'));

-- Recovery preserves receipts and stopped schedules. No archive can start old work.
insert into public.companion_action_receipts
 select (jsonb_populate_record(null::public.companion_action_receipts,a.row_data)).*
 from companion_reminder_private.archive a where source='receipt'
 and exists(select 1 from auth.users where id=(a.row_data->>'user_id')::uuid) on conflict do nothing;
insert into public.companion_proposals
 select (jsonb_populate_record(null::public.companion_proposals,a.row_data ||
   case when a.row_data->>'status'='draft' then jsonb_build_object('status','cancelled') else '{}'::jsonb end)).*
 from companion_reminder_private.archive a where source='proposal'
 and exists(select 1 from auth.users where id=(a.row_data->>'user_id')::uuid) on conflict do nothing;
update public.companion_task_reminders r set wall_time=(a.row_data->>'wall_time')::timestamp,
 revision=(a.row_data->>'revision')::bigint,replaces_id=(a.row_data->>'replaces_id')::uuid
 from companion_reminder_private.archive a where a.source='reminder' and r.id=a.identity::uuid;
delete from companion_reminder_private.archive;

create function companion_reminder_private.audit() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' and (new.status,new.cancelled_reason) is distinct from (old.status,old.cancelled_reason) then
  new.revision:=old.revision+1;
 end if;
 if tg_op='INSERT' or (new.status,new.cancelled_reason) is distinct from (old.status,old.cancelled_reason) then
  insert into companion_reminder_private.history(reminder_id,user_id,value) values(new.id,new.user_id,to_jsonb(new));
 end if;
 return new;
end $$;
create trigger companion_reminder_audit before insert or update on public.companion_task_reminders
 for each row execute function companion_reminder_private.audit();

alter function public.companion_validate_operations(jsonb) rename to companion_before368_validate;
create function public.companion_validate_operations(p_ops jsonb) returns void
language plpgsql set search_path=public,pg_temp as $$
declare o jsonb:=p_ops->0; k text; instant timestamptz; wall timestamp;
begin
 if coalesce(o->>'type','') not in ('reminder.schedule','reminder.cancel') then
  perform public.companion_before368_validate(p_ops); return;
 end if;
 if jsonb_typeof(p_ops)<>'array' or jsonb_array_length(p_ops)<>1 or not public.companion_task_ref_valid(o->>'task_ref')
 or public.companion_nonneg_int(o->'expected_revision',15) is null then
  perform public.companion_fail('CA422','invalid_reminder');
 end if;
 for k in select jsonb_object_keys(o) loop
  if k not in ('type','task_ref','expected_revision','remind_at','time_zone','wall_time','reminder_id','expected_reminder_revision') then
   perform public.companion_fail('CA422','unknown_field');
  end if;
 end loop;
 if o->>'type'='reminder.cancel' or o ? 'reminder_id' then
  if coalesce(o->>'reminder_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or public.companion_nonneg_int(o->'expected_reminder_revision',15) is null then
   perform public.companion_fail('CA422','reminder_revision_required');
  end if;
 elsif o ? 'expected_reminder_revision' then
  perform public.companion_fail('CA422','invalid_reminder');
 end if;
 if o->>'type'='reminder.cancel' then
  if o ?| array['remind_at','time_zone','wall_time'] then perform public.companion_fail('CA422','unknown_field'); end if;
  return;
 end if;
 if jsonb_typeof(o->'remind_at') is distinct from 'string' or jsonb_typeof(o->'wall_time') is distinct from 'string'
  or coalesce(o->>'remind_at','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$'
  or coalesce(o->>'wall_time','') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?$'
  or not exists(select 1 from pg_timezone_names where name=o->>'time_zone' and name like '%/%') then
  perform public.companion_fail('CA422','explicit_instant_and_zone_required');
 end if;
 begin
  instant:=(o->>'remind_at')::timestamptz;wall:=(o->>'wall_time')::timestamp;
  if not isfinite(instant) or (instant at time zone (o->>'time_zone')) is distinct from wall then
   perform public.companion_fail('CA422','wall_time_offset_mismatch');
  end if;
 exception when invalid_datetime_format or datetime_field_overflow then
  perform public.companion_fail('CA422','invalid_reminder_time');
 end;
end $$;

-- Parent first, reminder second. This also orders first content progress inserts.
create function public.companion_reminder_context(p_user uuid,p_op jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.companion_task_reminders%rowtype; rev bigint; state text;
begin
 if p_op->>'type'='reminder.schedule' then state:=public.companion_step_parent(p_user,p_op->>'task_ref');
 else
  perform public.companion_step_parent_lock(p_user,p_op->>'task_ref');
  -- Cancellation stays possible after lifecycle cancellation. It never restarts work.
  if p_op->>'task_ref' like 'custom:%' then
   select public.companion_task_state(completed,progress_state) into state from public.custom_checklist_tasks where user_id=p_user and id=substr(p_op->>'task_ref',8)::bigint for share;
  else
   select public.companion_task_state(completed,progress_state) into state from public.user_tasks where user_id=p_user and sanity_checklist_id=substr(p_op->>'task_ref',8) for share;
  end if;
 end if;
 rev:=public.companion_task_revision(p_user,p_op->>'task_ref');
 if rev is null then perform public.companion_fail('CA404','task_not_found'); end if;
 if p_op ? 'reminder_id' then
  select * into r from public.companion_task_reminders where id=(p_op->>'reminder_id')::uuid
   and user_id=p_user and task_ref=p_op->>'task_ref' for update;
  if not found then perform public.companion_fail('CA404','reminder_not_found'); end if;
 end if;
 return jsonb_build_object('task_revision',rev,'state',state,'reminder',case when r.id is null then null else to_jsonb(r)-'user_id' end);
end $$;

alter function public.companion_prepare_proposal(uuid,jsonb,jsonb) rename to companion_before368_prepare;
create function public.companion_prepare_proposal(p_user_id uuid,p_operations jsonb,p_source jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare ctx jsonb; src jsonb; p public.companion_proposals%rowtype; ops jsonb:=p_operations; prior public.companion_task_reminders%rowtype;
begin
 if coalesce(p_operations->0->>'type','') not in ('reminder.schedule','reminder.cancel') then
  return public.companion_before368_prepare(p_user_id,p_operations,p_source);
 end if;
 perform public.companion_validate_operations(p_operations);
 src:=public.companion_check_source(p_user_id,p_source);
 ctx:=public.companion_reminder_context(p_user_id,ops->0);
 ops:=jsonb_build_array((ops->0)||jsonb_build_object('expected_revision',ctx->'task_revision'));
 if ops->0->>'type'='reminder.schedule' and not (ops->0 ? 'reminder_id') then
  select * into prior from public.companion_task_reminders where user_id=p_user_id and task_ref=ops->0->>'task_ref' and status='pending' for update;
  if found then
   ops:=jsonb_build_array((ops->0)||jsonb_build_object('reminder_id',prior.id,'expected_reminder_revision',prior.revision));
   ctx:=public.companion_reminder_context(p_user_id,ops->0);
  end if;
 end if;
 insert into public.companion_proposals(user_id,operations,operations_hash,kind,context,source,updated_at)
 values(p_user_id,ops,public.companion_ops_hash(ops),'reminder',ctx,src,now()) returning * into p;
 return public.companion_proposal_view(p);
end $$;

alter function public.companion_recheck_proposal(uuid,jsonb,jsonb) rename to companion_before368_recheck;
create function public.companion_recheck_proposal(p_user uuid,p_ops jsonb,p_auth jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare p public.companion_proposals%rowtype; ctx jsonb; op jsonb:=p_ops->0;
begin
 if coalesce(op->>'type','') not in ('reminder.schedule','reminder.cancel') then
  return public.companion_before368_recheck(p_user,p_ops,p_auth);
 end if;
 if p_auth->>'kind'<>'approved_proposal' then return null; end if;
 select * into p from public.companion_proposals where id=(p_auth->>'proposal_id')::uuid and user_id=p_user for update;
 if not found or p.kind<>'reminder' or p.status<>'draft' or p.revision is distinct from (p_auth->>'proposal_revision')::bigint
  or p.operations_hash<>public.companion_ops_hash(p_ops) then perform public.companion_fail('CA403','invalid_authorization'); end if;
 ctx:=public.companion_reminder_context(p_user,op);
 if ctx=p.context then return null; end if;
 op:=op || jsonb_build_object('expected_revision',ctx->'task_revision');
 if op ? 'reminder_id' then op:=op || jsonb_build_object('expected_reminder_revision',ctx->'reminder'->'revision'); end if;
 update public.companion_proposals set operations=jsonb_build_array(op),operations_hash=public.companion_ops_hash(jsonb_build_array(op)),
 revision=revision+1,previous_context=context,context=ctx,review_reason='context_changed',updated_at=now()
 where id=p.id returning * into p;
 return public.companion_proposal_view(p);
end $$;

alter function public.companion_check_authorization(uuid,jsonb,jsonb) rename to companion_before368_authorization;
create function public.companion_check_authorization(p_user uuid,p_ops jsonb,p_auth jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare p uuid; msg bigint;
begin
 if coalesce(p_ops->0->>'type','') not in ('reminder.schedule','reminder.cancel') then
  return public.companion_before368_authorization(p_user,p_ops,p_auth);
 end if;
 if p_ops->0->>'type'='reminder.cancel' and (p_auth->'removal_confirmed') is distinct from 'true'::jsonb then
  perform public.companion_fail('CA403','removal_requires_confirmation');
 end if;
 if p_auth->>'kind'='ui_control' then return null; end if;
 if p_auth->>'kind'='approved_proposal' then
  update public.companion_proposals set status='applied',updated_at=now()
   where user_id=p_user and id=(p_auth->>'proposal_id')::uuid and revision=(p_auth->>'proposal_revision')::bigint
   and kind='reminder' and status='draft' and operations_hash=public.companion_ops_hash(p_ops) returning id into p;
  if p is null then perform public.companion_fail('CA403','invalid_authorization'); end if;
  return null;
 end if;
 if p_auth->>'kind'='direct_command' and p_ops->0->>'type'='reminder.schedule' then
  msg:=public.companion_nonneg_int(p_auth->'message_id',9);
  if msg is null or not exists(select 1 from public.messages m join public.conversations c on c.id=m.conversation_id
   where m.id=msg and c.user_id=p_user and m.role='user') then perform public.companion_fail('CA403','invalid_authorization'); end if;
  begin
   insert into public.companion_command_uses(user_id,message_id,operation_id)
   values(p_user,msg,current_setting('companion.operation_id')::uuid);
  exception when unique_violation then perform public.companion_fail('CA412','command_already_used'); end;
  return null;
 end if;
 perform public.companion_fail('CA403','invalid_authorization');return null;
end $$;

alter function public.companion_apply_one(uuid,jsonb) rename to companion_before368_apply;
create function public.companion_apply_one(p_user uuid,p_op jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare ctx jsonb; r public.companion_task_reminders%rowtype; rid uuid; rev bigint; inv jsonb;
begin
 if coalesce(p_op->>'type','') not in ('reminder.schedule','reminder.cancel') then return public.companion_before368_apply(p_user,p_op);end if;
 ctx:=public.companion_reminder_context(p_user,p_op);rev:=(ctx->>'task_revision')::bigint;
 if rev is distinct from (p_op->>'expected_revision')::bigint then
  perform public.companion_fail('CA409','revision_conflict',jsonb_build_object('task_ref',p_op->>'task_ref','expected',p_op->'expected_revision','actual',rev));
 end if;
 if p_op ? 'reminder_id' then
  r:=jsonb_populate_record(null::public.companion_task_reminders,ctx->'reminder');
  if r.revision is distinct from (p_op->>'expected_reminder_revision')::bigint then perform public.companion_fail('CA409','revision_conflict'); end if;
  if r.status<>'pending' then perform public.companion_fail('CA409','reminder_stopped');end if;
  update public.companion_task_reminders set status='cancelled',cancelled_reason=case when p_op->>'type'='reminder.cancel' then 'user_cancelled' else 'rescheduled' end,
   cancelled_at=clock_timestamp() where id=r.id;
 end if;
 if p_op->>'type'='reminder.schedule' then
  if (p_op->>'remind_at')::timestamptz<=clock_timestamp() then perform public.companion_fail('CA422','future_time_required');end if;
  if exists(select 1 from public.companion_task_reminders where user_id=p_user and task_ref=p_op->>'task_ref' and status='pending') then
   perform public.companion_fail('CA409','existing_reminder_requires_review'); end if;
  insert into public.companion_task_reminders(user_id,task_ref,remind_at,time_zone,wall_time,replaces_id)
   values(p_user,p_op->>'task_ref',(p_op->>'remind_at')::timestamptz,p_op->>'time_zone',(p_op->>'wall_time')::timestamp,r.id) returning id into rid;
  inv:=jsonb_build_object('type','reminder.cancel','task_ref',p_op->>'task_ref','expected_revision',rev,'reminder_id',rid,'expected_reminder_revision',1);
 else rid:=r.id; end if;
 return jsonb_build_object('type',p_op->>'type','task_ref',p_op->>'task_ref','reminder_id',rid,
  'remind_at',p_op->'remind_at','time_zone',p_op->'time_zone','wall_time',p_op->'wall_time',
  'before_reminder',ctx->'reminder','before_revision',rev,'after_revision',rev,
  'before_state',coalesce(ctx->>'state','not_started'),'state',coalesce(ctx->>'state','not_started'),
  'persistence','saved','scheduling',case when p_op->>'type'='reminder.cancel' then 'stopped' else 'registered' end,
  'delivery','not_observed','inverse',inv);
end $$;

alter function public.companion_receipt_summary(public.companion_action_receipts) rename to companion_before368_summary;
create function public.companion_receipt_summary(p_receipt public.companion_action_receipts) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare r jsonb:=p_receipt.outcome->'results'->0; result jsonb;
begin
 result:=public.companion_before368_summary(p_receipt);
 if coalesce(r->>'type','') not in ('reminder.schedule','reminder.cancel') then return result;end if;
 return result || jsonb_build_object('reminder',r,'undoable',p_receipt.undo_of is null and not exists(
 select 1 from public.companion_action_receipts u where u.user_id=p_receipt.user_id and u.undo_of=p_receipt.operation_id),
 'current',exists(select 1 from public.companion_task_reminders x where x.id=(r->>'reminder_id')::uuid
 and x.user_id=p_receipt.user_id and x.status=case when r->>'type'='reminder.schedule' then 'pending' else 'cancelled' end));
end $$;

-- Undo only stops the schedule this receipt saved. A cancellation Undo acknowledges
-- its receipt but leaves the old schedule stopped. A new time requires a new review.
alter function public.companion_undo_action(uuid,uuid,integer,jsonb,uuid) rename to companion_before368_undo;
create function public.companion_undo_action(p_user_id uuid,p_operation_id uuid,p_contract_version integer,p_authorization jsonb,p_receipt_operation_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.companion_action_receipts%rowtype; r jsonb; replay jsonb; h text; ctx jsonb; op jsonb;
begin
 select * into t from public.companion_action_receipts where user_id=p_user_id and operation_id=p_receipt_operation_id;
 if not found or coalesce(t.outcome->'results'->0->>'type','') not in ('reminder.schedule','reminder.cancel') then
 return public.companion_before368_undo(p_user_id,p_operation_id,p_contract_version,p_authorization,p_receipt_operation_id);end if;
 h:=public.companion_ops_hash(jsonb_build_object('undo',p_receipt_operation_id));replay:=public.companion_replay(p_user_id,p_operation_id,h);
 if replay is not null then return replay;end if;
 if p_authorization->>'kind' is distinct from 'ui_control' then perform public.companion_fail('CA403','invalid_authorization');end if;
 r:=t.outcome->'results'->0;
 perform public.companion_step_parent_lock(p_user_id,t.task_ref);
 if exists(select 1 from public.companion_action_receipts where user_id=p_user_id and undo_of=p_receipt_operation_id) then
 perform public.companion_fail('CA411','already_undone');end if;
 if r->>'type'='reminder.schedule' then
  if p_authorization->'removal_confirmed' is distinct from 'true'::jsonb then perform public.companion_fail('CA403','removal_requires_confirmation');end if;
  -- Never touch a later schedule or restore a predecessor. Revision checked under lock.
  update public.companion_task_reminders set status='cancelled',cancelled_reason='schedule_undo',cancelled_at=clock_timestamp()
   where id=(r->>'reminder_id')::uuid and user_id=p_user_id and status='pending' and revision=1;
 end if;
 r:=r || jsonb_build_object('type','reminder.cancel','scheduling','stopped','delivery','not_observed','inverse',null);
 return public.companion_record(p_user_id,p_operation_id,h,p_contract_version,p_authorization,jsonb_build_array(r),p_receipt_operation_id);
end $$;

create function companion_reminder_private.tick() returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare r record;n integer:=0;f integer:=0;a integer:=0;added integer;err text;cursor_id uuid;
begin
 -- At most 50 candidates. A durable circular cursor advances even if a task and
 -- its reminder are locked. Busy candidates cannot starve later due work.
 -- Unlocked failures also receive a retry backoff.
 -- Advisory single-worker lock prevents overlapping manual/cron execution.
 if not pg_try_advisory_xact_lock(368,0) then return;end if;
 select last_id into cursor_id from companion_reminder_private.scan_state where singleton;
 for r in select x.id,x.user_id,x.task_ref from public.companion_task_reminders x
  where x.status='pending' and x.remind_at<=clock_timestamp() and x.next_attempt_at<=clock_timestamp()
   and not exists(select 1 from companion_reminder_private.events e where e.reminder_id=x.id)
  order by case when x.id>cursor_id then 0 else 1 end,x.id limit 50
 loop
  a:=a+1;
  update companion_reminder_private.scan_state set last_id=r.id where singleton;
  begin
   -- A lock timeout isolates a busy task. No reminder lock precedes this call.
   perform set_config('lock_timeout','200ms',true);
   perform public.companion_step_parent(r.user_id,r.task_ref);
   insert into companion_reminder_private.events(reminder_id,user_id)
    select id,user_id from public.companion_task_reminders where id=r.id and status='pending' and remind_at<=clock_timestamp()
    on conflict do nothing;
   get diagnostics added=row_count;n:=n+added;
   update public.companion_task_reminders set attempt_count=attempt_count+1,last_error=null where id=r.id;
  exception when sqlstate 'CA404' or sqlstate 'CA422' then continue;
  when others then
   get stacked diagnostics err=returned_sqlstate;
   f:=f+1;
   -- The failed subtransaction releases its locks before retry metadata is written.
   begin
    perform set_config('lock_timeout','20ms',true);
    update public.companion_task_reminders set attempt_count=attempt_count+1,last_error=err,next_attempt_at=clock_timestamp()+interval '30 seconds' where id=r.id;
   exception when lock_not_available then null;end;
  end;
 end loop;
 insert into companion_reminder_private.runs(attempted,claimed,failed) values(a,n,f);
end $$;

create function public.companion_read_reminders(p_user_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
 select jsonb_build_object('items',coalesce((select jsonb_agg(j order by j->>'remind_at',j->>'reminder_id') from (
 select jsonb_build_object('reminder_id',r.id,'task_ref',r.task_ref,'remind_at',r.remind_at,'time_zone',r.time_zone,
 'wall_time',r.wall_time,'revision',r.revision,'status',r.status,'cancelled_reason',r.cancelled_reason,
 'title',c.title,'due',e.reminder_id is not null and r.status='pending'
 and coalesce(c.completed,u.completed,false)=false and c.removed_at is null and u.dismissed_at is null
 and (r.task_ref like 'sanity:%' or c.id is not null),
 'due_at',e.due_at,'last_error',r.last_error,
 'history',(select coalesce(jsonb_agg(jsonb_build_object('at',h.at,'status',h.value->'status','reason',h.value->'cancelled_reason') order by h.id),'[]'::jsonb)
 from companion_reminder_private.history h where h.reminder_id=r.id and h.user_id=p_user_id)) j
 from public.companion_task_reminders r
 left join companion_reminder_private.events e on e.reminder_id=r.id
 left join public.custom_checklist_tasks c on r.task_ref='custom:'||c.id and c.user_id=r.user_id
 left join public.user_tasks u on r.task_ref='sanity:'||u.sanity_checklist_id and u.user_id=r.user_id
 where r.user_id=p_user_id) x),'[]'::jsonb),
 'scheduler',case when not exists(select 1 from cron.job where jobname='companion-reminder-due' and active) then 'unavailable'
 when not exists(select 1 from companion_reminder_private.runs where at>now()-interval '2 minutes') then 'unavailable'
 when (select d.status='failed' from cron.job_run_details d join cron.job j on j.jobid=d.jobid where j.jobname='companion-reminder-due' and d.status in ('failed','succeeded') order by d.runid desc limit 1) then 'degraded'
 when exists(select 1 from public.companion_task_reminders r where r.user_id=p_user_id and r.status='pending' and r.last_error is not null) then 'degraded'
 when (select failed>0 from companion_reminder_private.runs order by id desc limit 1) then 'degraded' else 'ready' end,
 'delivery','not_observed')
$$;

alter function public.companion_conversation_actions(uuid,uuid) rename to companion_before368_conversation;
create function public.companion_conversation_actions(p_user_id uuid,p_conversation_id uuid) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare result jsonb;
begin
 result:=public.companion_before368_conversation(p_user_id,p_conversation_id);
 return result || jsonb_build_object('reminder_proposals',(select coalesce(jsonb_agg(public.companion_proposal_view(p) order by p.created_at),'[]'::jsonb)
 from public.companion_proposals p where p.user_id=p_user_id and p.kind='reminder' and p.source->>'conversation_id'=p_conversation_id::text));
end $$;
revoke all on function public.companion_conversation_actions(uuid,uuid) from public,anon,authenticated;
grant execute on function public.companion_conversation_actions(uuid,uuid) to service_role;

-- Exactly one periodic job. Release cadence: one minute, bounded to 50 candidates.
select cron.schedule('companion-reminder-due','* * * * *','select companion_reminder_private.tick()');
revoke all on all functions in schema companion_reminder_private from public,anon,authenticated;
revoke all on function public.companion_validate_operations(jsonb),public.companion_reminder_context(uuid,jsonb),
 public.companion_prepare_proposal(uuid,jsonb,jsonb),public.companion_recheck_proposal(uuid,jsonb,jsonb),
 public.companion_check_authorization(uuid,jsonb,jsonb),public.companion_apply_one(uuid,jsonb),
 public.companion_receipt_summary(public.companion_action_receipts),public.companion_undo_action(uuid,uuid,integer,jsonb,uuid),
 public.companion_read_reminders(uuid) from public,anon,authenticated;
grant execute on function public.companion_validate_operations(jsonb),public.companion_reminder_context(uuid,jsonb),
 public.companion_prepare_proposal(uuid,jsonb,jsonb),public.companion_recheck_proposal(uuid,jsonb,jsonb),
 public.companion_check_authorization(uuid,jsonb,jsonb),public.companion_apply_one(uuid,jsonb),
 public.companion_receipt_summary(public.companion_action_receipts),public.companion_undo_action(uuid,uuid,integer,jsonb,uuid),
 public.companion_read_reminders(uuid) to service_role;
notify pgrst,'reload schema';
