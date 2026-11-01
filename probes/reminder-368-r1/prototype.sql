-- Disposable SQL only. Not a production migration.
create extension if not exists pg_cron;
create schema probe368;
revoke all on schema probe368 from public, anon, authenticated;

create table probe368.events (
  reminder_id uuid primary key references public.companion_task_reminders(id) on delete cascade,
  due_at timestamptz not null default clock_timestamp()
);
create table probe368.runs (
  id bigint generated always as identity primary key,
  at timestamptz not null default clock_timestamp(),
  actor text not null default current_user,
  inserted integer not null
);
create table probe368.faults (kind text primary key);
alter table probe368.events enable row level security;
alter table probe368.runs enable row level security;
alter table probe368.faults enable row level security;

-- Leave pending intact after a claim. Existing #361 lifecycle triggers then stop
-- both unclaimed and claimed schedules. No trigger or old status constraint changes.
alter function public.companion_validate_operations(jsonb) rename to probe368_original_validate;
create function public.companion_validate_operations(p_ops jsonb) returns void
language plpgsql set search_path = public, pg_temp as $$
declare o jsonb := p_ops->0; k text;
begin
  if o->>'type' in ('probe.reminder_schedule', 'probe.reminder_cancel') then
    if jsonb_typeof(p_ops) <> 'array' or jsonb_array_length(p_ops) <> 1 then
      perform public.companion_fail('CA422','invalid_operations');
    end if;
    for k in select jsonb_object_keys(o) loop
      if k not in ('type','task_ref','expected_revision','remind_at','time_zone','wall_time') then
        perform public.companion_fail('CA422','unknown_field');
      end if;
    end loop;
    -- This bounded probe supports existing custom tasks only.
    if coalesce(o->>'task_ref','') !~ '^custom:[1-9][0-9]{0,17}$'
       or public.companion_nonneg_int(o->'expected_revision',15) is null then
      perform public.companion_fail('CA422','invalid_probe_request');
    end if;
    if o->>'type' = 'probe.reminder_schedule' then
      if jsonb_typeof(o->'remind_at') is distinct from 'string'
         or jsonb_typeof(o->'time_zone') is distinct from 'string'
         or jsonb_typeof(o->'wall_time') is distinct from 'string'
         or o->>'remind_at' !~ '(Z|[+-][0-9]{2}:[0-9]{2})$'
         or not exists (select 1 from pg_timezone_names where name = o->>'time_zone') then
        perform public.companion_fail('CA422','explicit_instant_and_zone_required');
      end if;
      begin
        if ((o->>'remind_at')::timestamptz at time zone (o->>'time_zone'))
            is distinct from (o->>'wall_time')::timestamp then
          perform public.companion_fail('CA422','wall_time_offset_mismatch');
        end if;
        if not isfinite((o->>'remind_at')::timestamptz) then
          perform public.companion_fail('CA422','invalid_probe_time');
        end if;
      exception when invalid_datetime_format or datetime_field_overflow then
        perform public.companion_fail('CA422','invalid_probe_time');
      end;
    end if;
  else
    perform public.probe368_original_validate(p_ops);
  end if;
end $$;

alter function public.companion_apply_one(uuid,jsonb) rename to probe368_original_apply;
create function public.companion_apply_one(p_user uuid, p_op jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare rid uuid; rev bigint; stopped integer;
begin
  if p_op->>'type' not in ('probe.reminder_schedule','probe.reminder_cancel') then
    return public.probe368_original_apply(p_user,p_op);
  end if;
  perform public.companion_step_parent(p_user,p_op->>'task_ref');
  rev := public.companion_task_revision(p_user,p_op->>'task_ref');
  if rev is distinct from (p_op->>'expected_revision')::bigint then
    perform public.companion_fail('CA409','revision_conflict');
  end if;
  if p_op->>'type' = 'probe.reminder_cancel' then
    update public.companion_task_reminders set status='cancelled',
      cancelled_reason='user_cancelled', cancelled_at=clock_timestamp()
      where user_id=p_user and task_ref=p_op->>'task_ref' and status='pending';
    get diagnostics stopped = row_count;
    return jsonb_build_object('type',p_op->>'type','task_ref',p_op->>'task_ref',
      'stopped',stopped,'before_revision',rev,'after_revision',rev);
  end if;
  insert into public.companion_task_reminders(user_id,task_ref,remind_at,time_zone)
    values(p_user,p_op->>'task_ref',(p_op->>'remind_at')::timestamptz,p_op->>'time_zone')
    returning id into rid;
  return jsonb_build_object('type',p_op->>'type','task_ref',p_op->>'task_ref',
    'reminder_id',rid,'persistence','saved','scheduling','registered_in_due_scan',
    'delivery','not_observed','before_revision',rev,'after_revision',rev);
end $$;

create function probe368.tick() returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare r record; n integer := 0; added integer;
begin
  if exists(select 1 from probe368.faults where kind='scheduler') then
    raise exception 'local probe scheduler fault';
  end if;
  -- Do not lock a reminder before its task. A legacy custom UPDATE takes its
  -- task row first. The lifecycle trigger then locks the reminder.
  for r in select id,user_id,task_ref from public.companion_task_reminders
    where status='pending' and remind_at <= clock_timestamp()
      and not exists(select 1 from probe368.events e where e.reminder_id=id)
    order by user_id,task_ref,id
  loop
    begin
      perform public.companion_step_parent(r.user_id,r.task_ref);
    exception when sqlstate 'CA422' or sqlstate 'CA404' then continue;
    end;
    insert into probe368.events(reminder_id)
      select id from public.companion_task_reminders
      where id=r.id and status='pending' and remind_at <= clock_timestamp()
      on conflict do nothing;
    get diagnostics added = row_count;
    n := n + added;
  end loop;
  insert into probe368.runs(inserted) values(n);
end $$;

create function public.probe368_due(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists(select 1 from probe368.faults where kind='read') then
    raise exception 'local probe read fault';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'reminder_id',r.id,'task_ref',r.task_ref,'remind_at',r.remind_at,
    'time_zone',r.time_zone,'due_at',e.due_at) order by r.id),'[]'::jsonb)
    from probe368.events e join public.companion_task_reminders r on r.id=e.reminder_id
    join public.custom_checklist_tasks t on r.task_ref='custom:'||t.id and t.user_id=r.user_id
    where r.user_id=p_user_id and r.status='pending' and not t.completed and t.removed_at is null);
end $$;

revoke all on function public.companion_validate_operations(jsonb),
  public.companion_apply_one(uuid,jsonb),public.probe368_due(uuid),
  probe368.tick() from public, anon, authenticated;
grant execute on function public.companion_validate_operations(jsonb),
  public.companion_apply_one(uuid,jsonb),public.probe368_due(uuid) to service_role;

-- Actual background scheduler. Tests never call tick to create a due event.
select cron.schedule('probe368-due','1 second','select probe368.tick()');
notify pgrst,'reload schema';
