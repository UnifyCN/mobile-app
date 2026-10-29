-- Local test barriers. These pause real transactions. They do not run the worker.
create table probe368.barriers(task_ref text primary key, kind text not null);
alter table probe368.barriers enable row level security;
create function probe368.barrier() returns trigger language plpgsql as $$
declare v_ref text; v_kind text;
begin
  if tg_table_name='events' then
    select task_ref into v_ref from public.companion_task_reminders where id=new.reminder_id;
    v_kind := 'claim';
  else
    v_ref := 'custom:'||new.id;
    if new.completed is not true and new.removed_at is null then return new; end if;
    v_kind := 'stop';
  end if;
  if exists(select 1 from probe368.barriers b where b.task_ref=v_ref and b.kind=v_kind) then
    perform pg_advisory_xact_lock(368,1);
  end if;
  return new;
end $$;
create trigger probe368_claim_barrier before insert on probe368.events
  for each row execute function probe368.barrier();
create trigger zz_probe368_stop_barrier after update on public.custom_checklist_tasks
  for each row execute function probe368.barrier();
